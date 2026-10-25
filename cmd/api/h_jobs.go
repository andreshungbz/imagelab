package main

import (
	"encoding/json"
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
	app.recordJobObservation(jobID) // MEAS-05: Observation Database Read.

	// Parse and validate "after" and "wait" query parameters.
	lpParams, err := app.readLongPollingParams(r.URL.Query())
	if err != nil {
		app.badRequestResponse(w, r, err)
		return
	}

	// SHORT POLLING (API-01): Perform short polling when there is no "after" query parameter.
	if !lpParams.hasAfter {
		app.checkAndLogTerminal(job)
		app.writePollingJobSnapshotResponse(w, r, job)
		return
	}

	// LONG POLLING (API-02): If "after" exceeds current version, return a 400 Bad Request.
	if lpParams.after > job.Version {
		app.checkAndLogTerminal(job)
		app.badRequestResponse(w, r, errors.New("'after' parameter exceeds current job version"))
		return
	}

	// LONG POLLING (API-02): If the job status is terminal (completed/failed), return a 200 OK with the job snapshot.
	if job.Terminal() {
		app.checkAndLogTerminal(job)
		app.writePollingJobSnapshotResponse(w, r, job)
		return
	}

	// LONG POLLING (API-02): If the current job version is greater than the "after" parameter, return a 200 OK with the job snapshot.
	if job.Version > lpParams.after {
		app.checkAndLogTerminal(job)
		app.writePollingJobSnapshotResponse(w, r, job)
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

	// WAIT-01: The data.JobModel.MarkCompletedWithProgress/MarkFailed/UpdateProgress methods which increment the job version,
	//          alongside this long polling handler, form the Counter + Version waiting approach.
	// WAIT-01: The signals from the ticker and timer signals are captured and they check the persisted state.
	// WAIT-01: Because the ticker continually polls the database, any change committed between request arrival
	// 			and holding expiry is guaranteed to be detected without missing updates.
	// WAIT-02: Main non-busy loop for handling the long polling logic. The select statement is non-blocking.
	for {
		select {
		// Holds the request until a committed change.
		// VER-03: With a ticker implementation, this observer only checks committed changes to the job version.
		// VER-03: With multiple observers, each has its own ticker and queries the database independently.
		// VER-03: Given that the ticker fires at the configured interval, only the latest job state is read, coalescing notifications.
		// WAIT-01: On wake-up/tick, recheck the job version.
		case <-ticker.C:
			latestJob, err := app.models.Jobs.GetByPublicID(jobID)
			if err != nil {
				app.serverErrorResponse(w, r, err)
				return
			}
			app.recordJobObservation(jobID) // MEAS-05: Observation Database Read.

			if latestJob.Terminal() || latestJob.Version > lpParams.after {
				app.checkAndLogTerminal(latestJob)
				app.writePollingJobSnapshotResponse(w, r, latestJob)
				return
			}

		// Holds until holding deadline timer expires.
		case <-timer.C:
			// Final authoritative check before sending a 204 No Content.
			latestJob, err := app.models.Jobs.GetByPublicID(jobID)
			if err != nil {
				app.serverErrorResponse(w, r, err)
				return
			}
			app.recordJobObservation(jobID) // MEAS-05: Observation Database Read.

			if latestJob.Terminal() || latestJob.Version > lpParams.after {
				app.checkAndLogTerminal(latestJob)
				app.writePollingJobSnapshotResponse(w, r, latestJob)
				return
			}

			// If the job is still in progress and the version hasn't changed, return a 204 No Content response.
			w.WriteHeader(http.StatusNoContent)
			return

		// Holds until client connection cancellation.
		// WAIT-02: This request-context cancellation ends observation, not the worker's job.
		case <-r.Context().Done():
			return
		}
	}
}

// getImageJobEventsHandler streams versioned job snapshots to an EventSource client.
func (app *application) getImageJobEventsHandler(w http.ResponseWriter, r *http.Request) {
	// Extract the job public ID from the URL parameters.
	params := httprouter.ParamsFromContext(r.Context())
	jobID := params.ByName("id")

	// SYNC-03: 1. Subscribe.
	updates, unsubscribe := app.jobObservers.subscribe(jobID)
	defer unsubscribe() // SYNC-06: Release subscriber registrations when the handler exits.

	// SSE-02/SYNC-03: Read once after subscribing so unknown jobs return 404 without opening a stream.
	job, err := app.models.Jobs.GetByPublicID(jobID)
	if err != nil {
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r)
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}
	app.recordJobObservation(jobID) // MEAS-05: Observation Database Read.

	// SSE-03: Identify the response as an unbuffered event stream.
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	// SSE-04: Send the complete current snapshot immediately on connection (job-update event).
	if err := writeSSEJobSnapshot(w, job); err != nil {
		return
	}
	if app.shouldTestSSEDisconnectAfterStage(job) {
		return
	}

	// SSE-07: A terminal snapshot ends the server stream.
	if job.Terminal() {
		app.checkAndLogTerminal(job)
		return
	}

	// SYNC-03: 3. Wait.
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()
	lastVersion := job.Version
	for {
		select {
		// SYNC-04: Notification prompts a database reread. The signal itself doesn't contruct the SSE payload.
		case <-updates:
			// Read job snapshot from the database.
			job, err = app.models.Jobs.GetByPublicID(jobID)
			if err != nil {
				app.serverErrorResponse(w, r, err)
				return
			}
			app.recordJobObservation(jobID) // MEAS-05: Observation Database Read.

			// SYNC-05: Skip older or same versions. Notifications may be coalesced.
			if job.Version <= lastVersion {
				continue
			}

			// SSE-05: A newly observed committed version sends the current snapshot to the client (job-update event).
			if err := writeSSEJobSnapshot(w, job); err != nil {
				return
			}

			// Update the last observed version to the current one.
			lastVersion = job.Version
			if app.shouldTestSSEDisconnectAfterStage(job) {
				return
			}

			// SSE-07: A terminal snapshot ends the server stream.
			if job.Terminal() {
				app.checkAndLogTerminal(job)
				return
			}

		// SSE-08: Heartbeats keep idle streams active without changing job state or version.
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
				return
			}
			if err := http.NewResponseController(w).Flush(); err != nil {
				return
			}

		// SYNC-07: Client cancellation stops observation only. The worker remains independent.
		case <-r.Context().Done():
			return
		}
	}
}

// writePollingJobSnapshotResponse formats and writes the polling JSON payload.
func (app *application) writePollingJobSnapshotResponse(w http.ResponseWriter, r *http.Request, job *data.Job) {
	response, err := buildJobSnapshot(job)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	if err := app.writeJSON(w, http.StatusOK, response, nil); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}

// writeSSEJobSnapshot writes one complete named SSE event and flushes it without closing the stream.
func writeSSEJobSnapshot(w http.ResponseWriter, job *data.Job) error {
	snapshot, err := buildJobSnapshot(job)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}

	// SSE-06: The event frame ends with a blank line, and Flush makes it available immediately.
	if _, err := fmt.Fprintf(w, "event: job-update\ndata: %s\n\n", payload); err != nil { // Blank line ending.
		return err
	}
	return http.NewResponseController(w).Flush() // Flush call.
}

// buildJobSnapshot constructs the complete client-visible representation of a job.
func buildJobSnapshot(job *data.Job) (envelope, error) {
	// Safely assert that the payload is an ImagePayload.// Construct snapshot.
	imgPayload, ok := job.Payload.(data.ImagePayload)
	if !ok {
		return nil, fmt.Errorf("unexpected payload structure for job type %q", job.JobType)
	}

	// SSE-09: Construct snapshot without (internal) ID fields or claims to Last-Evend-ID replays.
	snapshot := envelope{
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
		snapshot["failed_at"] = job.FailedAt
	}
	// Conditionally add error field if it is not nil.
	if job.ErrorMessage != nil {
		snapshot["error"] = *job.ErrorMessage
	}
	// Conditionally add variants field if the result is not empty.
	if len(job.Result) > 0 && string(job.Result) != "null" {
		snapshot["variants"] = job.Result
	}

	return snapshot, nil
}

// shouldTestSSEDisconnectAfterStage returns true once after the configured stage snapshot is written.
func (app *application) shouldTestSSEDisconnectAfterStage(job *data.Job) bool {
	stage := app.config.test_sse_disconnect_after_stage
	if stage == "" || job.Stage != stage {
		return false
	}

	app.sseTestMu.Lock()
	defer app.sseTestMu.Unlock()
	if app.sseTestDisconnected == nil {
		app.sseTestDisconnected = make(map[string]struct{})
	}
	if _, disconnected := app.sseTestDisconnected[job.PublicID]; disconnected {
		return false
	}
	app.sseTestDisconnected[job.PublicID] = struct{}{}
	return true
}
