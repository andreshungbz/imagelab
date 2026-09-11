package main

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/andreshungbz/imagelab/internal/data"
	"github.com/julienschmidt/httprouter"
)

// getImageJobHandler retrieves a job from the database by its public ID.
func (app *application) getImageJobHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the job from the database using the public ID from the URL, handling errors.
	// A data.ErrRecordNotFound error can occur if the provided job public ID does not exist in the database.
	job, err := app.models.Jobs.GetByPublicID((httprouter.ParamsFromContext(r.Context())).ByName("id"))
	if err != nil {
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r)
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}

	// Safely assert that the payload is an ImagePayload.
	imgPayload, ok := job.Payload.(data.ImagePayload)
	if !ok {
		app.serverErrorResponse(w, r, fmt.Errorf("unexpected payload structure for job type %q", job.JobType))
		return
	}

	// Send a JSON response of the retrieved job, handling any errors.
	response := envelope{
		"id":           job.PublicID,
		"image_id":     imgPayload.ImageID,
		"status":       job.Status,
		"queued_at":    job.CreatedAt,
		"started_at":   job.StartedAt,
		"completed_at": job.CompletedAt,
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
