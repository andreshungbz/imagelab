package main

import (
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"strconv"

	"github.com/andreshungbz/imagelab/internal/data"
	"github.com/andreshungbz/imagelab/internal/validator"
	"github.com/julienschmidt/httprouter"
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

	// IMAGE VALIDATION

	v := validator.New()
	// Validate image file and format.
	_, format, err := image.DecodeConfig(file)
	if err != nil {
		// Validate image file.
		if errors.Is(err, image.ErrFormat) {
			v.AddError("file", "must be a valid image file (jpeg or png)")
		} else {
			v.AddError("file", "unable to parse image file")
		}
	} else {
		// Validate particular image format.
		v.Check(format == "jpeg" || format == "png", "image", "must be a valid image format (jpeg or png)")
	}
	// Validate maximum image size (10 MB).
	const maxImageSize = 10 * 1024 * 1024
	v.Check(header.Size <= maxImageSize, "image", "size must be less than 10MB")
	if !v.Valid() {
		app.failedValidationResponse(w, r, v.Errors)
		return
	}

	// Store the validated image using a server-controlled filename.
	storedFilePath, err := saveUploadedImage(file, "storage/uploads", format)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	// CREATE IMAGE RECORD

	// Create a new Image instance with the gathered metadata.
	mimeType := "image/jpeg"
	if format == "png" {
		mimeType = "image/png"
	}
	img := &data.Image{
		OriginalFilename: header.Filename,
		StoredFilename:   storedFilePath,
		MIMEType:         mimeType,
		SizeBytes:        header.Size,
	}

	// Insert the new image record into the database.
	if err := app.models.Images.Insert(img); err != nil {
		_ = os.Remove(storedFilePath) // Clean up the uploaded image if the new image record fails.
		app.serverErrorResponse(w, r, err)
		return
	}

	// CREATE IMAGE JOB (process_image_variants).

	// Insert the new job record into the database.
	job := &data.Job{
		ConsumerID: app.config.consumerID, // Preconfigured ImageLab Consumer ID
		JobType:    "process_image_variants",
		Payload: data.ImagePayload{
			ImageID:    img.ID,
			SourcePath: img.StoredFilename,
			Variants:   []string{"thumbnail", "preview", "display"},
		},
	}
	if err := app.models.Jobs.Insert(job); err != nil {
		_ = os.Remove(storedFilePath) // Clean up the uploaded image if the new job record fails.
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r) // Provided Consumer ID not found.
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}

	// Add a Location header to the response with the new job's public ID (UUIDv4).
	statusURL := fmt.Sprintf("/v1/jobs/%s", job.PublicID)
	headers := make(http.Header)
	headers.Set("Location", statusURL)

	// Send a JSON response of the newly created job, handling any errors.
	response := envelope{
		"image_id":   img.ID,
		"job_id":     job.PublicID,
		"status":     job.Status,
		"status_url": statusURL,
	}
	if err := app.writeJSON(w, http.StatusAccepted, response, headers); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}

// getImageVariantHandler serves the requested image variant from the server storage.
func (app *application) getImageVariantHandler(w http.ResponseWriter, r *http.Request) {
	// Extract the route parameters from the request context.
	params := httprouter.ParamsFromContext(r.Context())

	// Parse and validate the image_id path parameter.
	imageID, err := strconv.ParseInt(params.ByName("image_id"), 10, 64)
	if err != nil || imageID < 1 {
		app.notFoundResponse(w, r)
		return
	}

	// Retrieve the requested image variant name.
	variantName := params.ByName("image_variant")

	// Query the database for the image variant record.
	variant, err := app.models.ImageVariants.GetByImageIDAndName(imageID, variantName)
	if err != nil {
		if errors.Is(err, data.ErrRecordNotFound) {
			app.notFoundResponse(w, r)
			return
		}
		app.serverErrorResponse(w, r, err)
		return
	}

	// Verify that the file actually exists on the server storage.
	if _, err := os.Stat(variant.StoredFilename); os.IsNotExist(err) {
		app.notFoundResponse(w, r)
		return
	}

	// Serve the file directly.
	http.ServeFile(w, r, variant.StoredFilename)
}
