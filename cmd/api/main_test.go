package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestWriteJSON verifies the writeJSON helper function correctly writes JSON responses.
func TestWriteJSON(t *testing.T) {
	// Setup application recorder, response recorder, test data and headers.
	app := &application{}
	rr := httptest.NewRecorder()
	data := envelope{"message": "hello"}
	headers := http.Header{}
	headers.Set("X-Test-Header", "test")

	// Assert well-formed JSON.
	err := app.writeJSON(rr, http.StatusOK, data, headers)
	if err != nil {
		t.Fatalf("writeJSON error: %v", err)
	}

	// Assert 200 OK HTTP status code.
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	// Assert JSON Content-Type.
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", ct)
	}

	// Assert HTTP response body.
	if !strings.Contains(rr.Body.String(), `"message": "hello"`) {
		t.Errorf("Response body does not contain expected JSON")
	}
}

// TestReadJSON verifies the readJSON helper function correctly reads JSON from requests.
func TestReadJSON(t *testing.T) {
	// Setup application recorder, response recorder, test JSON body, and destination struct.
	app := &application{}
	rr := httptest.NewRecorder()
	jsonBody := `{"name":"George"}`
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(jsonBody))
	var input struct {
		Name string `json:"name"`
	}

	// Assert readJSON success.
	err := app.readJSON(rr, req, &input)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Assert that Name is properly read.
	if input.Name != "George" {
		t.Errorf("expected Name to be George, got %s", input.Name)
	}
}
