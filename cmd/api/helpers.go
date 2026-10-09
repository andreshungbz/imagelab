package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

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

// saveUploadedImage stores an image in the server's storage directory with a server-controlled filename.
func saveUploadedImage(r io.ReadSeeker, dir, format string) (string, error) {
	// Ensure we start writing from the beginning of the file.
	_, err := r.Seek(0, io.SeekStart)
	if err != nil {
		return "", err
	}

	// Determine the file extension from the detected image format.
	var extension string
	switch strings.ToLower(format) {
	case "jpeg", "jpg":
		extension = ".jpeg"
	case "png":
		extension = ".png"
	default:
		return "", fmt.Errorf("unsupported file format: %s", format)
	}

	// Create the storage directory if it doesn't exist.
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	// Generate server-controlled filename that is a UUIDv7 string and the path.
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}
	storedFilename := id.String() + extension

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

	return path, nil
}

// getQueryString retrieves a string value from URL query parameters, returning a default value if absent.
func getQueryString(qs map[string][]string, key string, defaultValue string) string {
	values, ok := qs[key]
	if !ok || len(values) == 0 {
		return defaultValue
	}
	return values[0]
}

// longPollingParams holds parsed parameter values for versioned long-polling observation endpoints.
type longPollingParams struct {
	after    int // Minimum job version threshold
	hasAfter bool
	wait     time.Duration // Holding duration for long polling (1s to 20s)
	hasWait  bool
}

// readLongPollingParams extracts, parses, and validates the "after" and "wait" query parameters.
func (app *application) readLongPollingParams(qs map[string][]string) (longPollingParams, error) {
	var params longPollingParams

	// Parse "after" parameter.
	afterStr := getQueryString(qs, "after", "")
	if afterStr != "" {
		parsedAfter, err := strconv.Atoi(afterStr)
		// "after" must be a non-negative integer.
		if err != nil || parsedAfter < 0 {
			return params, errors.New("'after' parameter must be a non-negative integer")
		}
		params.after = parsedAfter
		params.hasAfter = true
	}

	// Parse "wait" parameter.
	waitStr := getQueryString(qs, "wait", "")
	if waitStr != "" {
		params.hasWait = true

		// Reject "wait" without "after".
		if !params.hasAfter {
			return params, errors.New("'wait' parameter requires 'after' parameter")
		}

		// "wait" must be an integer between 1 and 20 seconds.
		parsedWait, err := strconv.Atoi(waitStr)
		if err != nil || parsedWait < 1 || parsedWait > 20 {
			return params, errors.New("'wait' parameter must be an integer from 1 to 20")
		}

		params.wait = time.Duration(parsedWait) * time.Second
	} else if params.hasAfter {
		// Default to 20s wait duration when "after" is supplied without "wait".
		params.wait = 20 * time.Second
	}

	return params, nil
}
