package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// envelope encloses a JSON response.
type envelope map[string]any

// writeJSON encodes data into a JSON response, applies HTTP headers, and writes the HTTP status code.
func (app *application) writeJSON(w http.ResponseWriter, status int, data envelope, headers http.Header) error {
	// Encode the data into JSON
	js, err := json.MarshalIndent(data, "", "\t")
	if err != nil {
		return err
	}
	js = append(js, '\n')

	// Apply HTTP headers
	for key, values := range headers {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// Set Content-Type and write to HTTP response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(js)

	return nil
}

// readJSON decodes JSON input, writing it to a destination object.
func (app *application) readJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	// Set a reasonable 1MB limit for HTTP request body
	r.Body = http.MaxBytesReader(w, r.Body, 1_048_576)

	// Decode JSON and check for errors
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	err := dec.Decode(dst)
	if err != nil {
		var syntaxError *json.SyntaxError
		var unmarshalTypeError *json.UnmarshalTypeError
		var invalidUnmarshalError *json.InvalidUnmarshalError
		var maxBytesError *http.MaxBytesError

		switch {
		// Badly-formed JSON
		case errors.As(err, &syntaxError):
			return fmt.Errorf("Body contains badly-formed JSON (at character %d)", syntaxError.Offset)
		case errors.Is(err, io.ErrUnexpectedEOF):
			return errors.New("Body contains badly-formed JSON")

		// Incorrect JSON types for destination fields
		case errors.As(err, &unmarshalTypeError):
			if unmarshalTypeError.Field != "" {
				return fmt.Errorf("Body contains incorrect JSON type for field %q", unmarshalTypeError.Field)
			}
			return fmt.Errorf("Body contains incorrect JSON type (at character %d)", unmarshalTypeError.Offset)

		// Empty HTTP request body
		case errors.Is(err, io.EOF):
			return errors.New("Body must not be empty")

		// Unknown JSON fields for destination fields
		case strings.HasPrefix(err.Error(), "json: unknown field "):
			fieldName := strings.TrimPrefix(err.Error(), "json: unknown field ")
			return fmt.Errorf("Body contains unknown key %s", fieldName)

		// Too-large HTTP request
		case errors.As(err, &maxBytesError):
			return fmt.Errorf("Body must not be larger than %d bytes", maxBytesError.Limit)

		// Programmer error: Passing non-nil pointer
		case errors.As(err, &invalidUnmarshalError):
			panic(err)

		default:
			return err
		}
	}

	// Check for extraneous input
	err = dec.Decode(&struct{}{})
	if !errors.Is(err, io.EOF) {
		return errors.New("Body must only contain a single JSON value")
	}

	return nil
}

// storeImage stores a file in the server's storage directory with a server-controlled filename.
func storeImage(r io.ReadSeeker, dir, format string) (string, error) {
	// Ensure we start writing from the beginning of the file.
	_, err := r.Seek(0, io.SeekStart)
	if err != nil {
		return "", err
	}

	// Determine the file extension from the detected image format.
	var extension string
	switch format {
	case "jpeg":
		extension = ".jpg" // Normalize the .jpeg extension to .jpg for consistency.
	case "png":
		extension = ".png"
	default:
		return "", fmt.Errorf("unsupported file format: %s", format)
	}

	// Create the storage directory if it doesn't exist.
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	// Generate server-controlled filename that is a UUIDv4 string and the path.
	storedFilename := uuid.NewString() + extension

	// Create the destination file.
	path := filepath.Join(dir, storedFilename)
	dst, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	// Store the image.
	if _, err := io.Copy(dst, r); err != nil {
		os.Remove(path) // Remove partially written file.
		return "", err
	}

	return storedFilename, nil
}
