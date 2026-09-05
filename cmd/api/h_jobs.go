package main

import (
	"errors"
	"net/http"

	"github.com/andreshungbz/imagelab/internal/data"
	"github.com/julienschmidt/httprouter"
)

// getJobHandler retrieves a job from the database by its public ID.
func (app *application) getJobHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the job from the database using the public ID from the URL, handling errors.
	// Like createReportHandler, a data.ErrRecordNotFound error can occur if the provided
	// job public ID does not exist in the database.
	job, err := app.models.Jobs.GetByPublicID((httprouter.ParamsFromContext(r.Context())).ByName("id"))
	if err != nil {
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r)
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}

	// Send a JSON response of the retrieved job, handling any errors.
	if err := app.writeJSON(w, http.StatusOK, envelope{"job": job}, nil); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}
