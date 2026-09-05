package main

import (
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"

	"github.com/andreshungbz/imagelab/internal/validator"
)

// processImageHandler reads an image file from the request, validates it,
// and stores it in the server's storage directory with a server-controlled filename.
// It then creates a process_image_variants job in the database.
func (app *application) processImageHandler(w http.ResponseWriter, r *http.Request) {
	// Extract the image file from the form data.
	file, header, err := r.FormFile("image")
	if err != nil {
		app.badRequestResponse(w, r, err)
		return
	}
	defer file.Close()

	// Image Validation
	v := validator.New()
	// Validate maximum image size (10 MB).
	const maxImageSize = 10 * 1024 * 1024
	v.Check(header.Size <= maxImageSize, "image", "must be less than 10MB")
	// Validate image format (JPEG or PNG).
	_, format, err := image.DecodeConfig(file)
	if err != nil {
		app.badRequestResponse(w, r, err)
		return
	}
	v.Check(format == "jpeg" || format == "png", "image", "must be a valid image format (jpeg or png)")
	if !v.Valid() {
		app.failedValidationResponse(w, r, v.Errors)
		return
	}

	// Store the validated image using a server-controlled filename.
	storedFilename, err := storeImage(file, "storage/uploads", format)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	fmt.Println(storedFilename)

	// TODO: Insert image record into the database to get the image ID.

	// TODO: Create a process_image_variants job in the database.

	// Add a Location header to the response with the new job's public ID (UUIDv4).
	statusURL := fmt.Sprintf("/v1/jobs/%s", "placeholder-job-id")
	headers := make(http.Header)
	headers.Set("Location", statusURL)

	// Send a JSON response of the newly created job, handling any errors.
	response := envelope{"image_id": "placeholder-image-id", "job_id": "placeholder-job-id", "status": "queued", "status_url": "/v1/jobs/placeholder-job-id"}
	if err := app.writeJSON(w, http.StatusAccepted, response, headers); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}

func (app *application) getImageVariantHandler(w http.ResponseWriter, r *http.Request) {

}
