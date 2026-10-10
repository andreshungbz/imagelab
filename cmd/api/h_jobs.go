package main

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/andreshungbz/imagelab/internal/data"
	"github.com/julienschmidt/httprouter"
)

// getImageJobHandler retrieves a job from the database by its public ID.
func (app *application) getImageJobHandler(w http.ResponseWriter, r *http.Request) {
	// API-03: Set Cache-Control: no-store universally for both short polling and long polling responses.
	w.Header().Set("Cache-Control", "no-store")

	// Extract the job public ID from the URL parameters.
	params := httprouter.ParamsFromContext(r.Context())
	jobID := params.ByName("id")

	// Initial database job lookup.
	job, err := app.models.Jobs.GetByPublicID(jobID)
	if err != nil {
		// Return a 404 Not Found response promptly if the job is not found (e.g., invalid public ID).
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r)
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}

	// Parse and validate "after" and "wait" query parameters.
	lpParams, err := app.readLongPollingParams(r.URL.Query())
	if err != nil {
		app.badRequestResponse(w, r, err)
		return
	}

	// SHORT POLLING (API-01): Perform short polling when there is no "after" query parameter.
	if !lpParams.hasAfter {
		app.writeJobSnapshotResponse(w, r, job)
		return
	}

	// LONG POLLING (API-02): If "after" exceeds current version, return a 400 Bad Request.
	if job.Version < lpParams.after {
		app.badRequestResponse(w, r, errors.New("'after' parameter exceeds current job version"))
		return
	}

	// LONG POLLING (API-02): If the job status is terminal (completed/failed), return a 200 OK with the job snapshot.
	if job.Terminal() {
		app.writeJobSnapshotResponse(w, r, job)
		return
	}

	// LONG POLLING (API-02): If the current job version is greater than the "after" parameter, return a 200 OK with the job snapshot.
	if job.Version > lpParams.after {
		app.writeJobSnapshotResponse(w, r, job)
		return
	}

	// LONG POLLING HOLDING (API-02)
	// job.Version == lpParams.after and job is not terminal.

	// Timer for the specified "wait" duration for holding.
	timer := time.NewTimer(lpParams.wait)
	// Ticker for periodic database rechecks during the holding period.
	ticker := time.NewTicker(app.config.test_lp_db_observation_interval)

	// WAIT-02: Ensure that resources are released after every exit path from this handler.
	defer timer.Stop()
	defer ticker.Stop()

	// WAIT-01: The data.JobModel.MarkCompleted/MarkFailed/UpdateProgress methods which increment the job version,
	//          alongside this long polling handler, form the Counter + Version waiting approach.
	// WAIT-01: The signals from the ticker and timer signals are captured and they check the persisted state.
	// WAIT-01: Because the ticker continually polls the database, any change committed between request arrival
	// 			and holding expiry is guaranteed to be detected without missing updates.
	// WAIT-02: Main non-busy loop for handling the long polling logic. The select statement is non-blocking.
	for {
		select {
		// Holds the request until a committed change.
		// VER-03: With a ticker implementation, this observer only checks committed changes to the job version.
		//         With multiple observers, each has its own ticker and queries the database independently.
		//         Given that the ticker fires at the configured interval, only the latest job state is read, coalescing notifications.
		// WAIT-01: On wake-up/tick, recheck the job version.
		case <-ticker.C:
			latestJob, err := app.models.Jobs.GetByPublicID(jobID)
			if err != nil {
				app.serverErrorResponse(w, r, err)
				return
			}

			if latestJob.Terminal() || latestJob.Version > lpParams.after {
				app.writeJobSnapshotResponse(w, r, latestJob)
				return
			}

		// Holds until holding deadline timer expires.
		case <-timer.C:
			// Final authoritative check before sending a 204 No Content.
			latestJob, err := app.models.Jobs.GetByPublicID(jobID)
			// On an unexpected server/database failure, return a 500 Internal Server Error response.
			if err != nil {
				app.serverErrorResponse(w, r, err)
				return
			}
			// If the job has transitioned to a terminal state or has a version greater than "after", return a 200 OK with the job snapshot.
			if latestJob.Terminal() || latestJob.Version > lpParams.after {
				app.writeJobSnapshotResponse(w, r, latestJob)
				return
			}

			// If the job is still in progress and the version hasn't changed, return a 204 No Content response.
			w.WriteHeader(http.StatusNoContent)
			return

		// WAIT-02: Holds until client connection cancellation. This request-context cancellation ends observation, not the worker's job.
		case <-r.Context().Done():
			return
		}
	}
}

// writeJobSnapshotResponse formats and writes the uniform observation JSON payload.
func (app *application) writeJobSnapshotResponse(w http.ResponseWriter, r *http.Request, job *data.Job) {
	// Safely assert that the payload is an ImagePayload.
	imgPayload, ok := job.Payload.(data.ImagePayload)
	if !ok {
		app.serverErrorResponse(w, r, fmt.Errorf("unexpected payload structure for job type %q", job.JobType))
		return
	}

	// Send a JSON response of the retrieved job, handling any errors.
	response := envelope{
		"id":                 job.PublicID,
		"image_id":           imgPayload.ImageID,
		"status":             job.Status,
		"version":            job.Version,
		"stage":              job.Stage,
		"variants_completed": job.VariantsCompleted,
		"simulated_progress": job.SimulatedProgress,
		"queued_at":          job.CreatedAt,
		"started_at":         job.StartedAt,
		"completed_at":       job.CompletedAt,
	}

	// Conditionally add failed_at field if it is not nil.
	if job.FailedAt != nil {
		response["failed_at"] = job.FailedAt
	}

	// Conditionally add variants field if the result is not empty.
	if len(job.Result) > 0 && string(job.Result) != "null" {
		response["variants"] = job.Result
	}

	if err := app.writeJSON(w, http.StatusOK, response, nil); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}
