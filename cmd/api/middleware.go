package main

import (
	"compress/gzip"
	"fmt"
	"net/http"
	"strings"
)

// recoverPanic sends a connection close header if a panic occurs.
func (app *application) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			pv := recover()
			if pv != nil {
				w.Header().Set("Connection", "close")
				app.serverErrorResponse(w, r, fmt.Errorf("%v", pv))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

// requestLogger logs the HTTP request's method and URL path.
func (app *application) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.logger.Info("Request received", "method", r.Method, "path", r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

// enableCORS configures browser CORS by reflecting a request's origin if they are in
// the list of trusted origins configured on server start. It also handles CORS
// preflight requests appropriately.
func (app *application) enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// indicator for caches that these responses may vary
		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Method")

		// retrieve the Origin header of the request
		origin := r.Header.Get("Origin")

		if origin != "" {
			// loop through every configured trusted origin
			for i := range app.config.cors.trustedOrigins {
				if origin == app.config.cors.trustedOrigins[i] { // on match
					// set that origin for Access-Control-Allow-Origin,
					// allowing cross-origin requests
					w.Header().Set("Access-Control-Allow-Origin", origin)

					// handle CORS preflight requests by checking OPTIONS and Access-Control-Request-Method
					if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
						// set the non-CORS-safe HTTP methods
						w.Header().Set("Access-Control-Allow-Methods", "OPTIONS, PUT, PATCH, DELETE")
						w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")

						// write 200 instead of 204 No Content for browser compatibility
						w.WriteHeader(http.StatusOK)
						return
					}

					break
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// gzipResponseWriter is a light wrapper around http.ResponseWriter that
// compresses responses written in the gzip format.
type gzipResponseWriter struct {
	http.ResponseWriter
	writer *gzip.Writer
}

// Write uses a *gzip.Writer instead of the http.ResponseWriter.
func (gzw gzipResponseWriter) Write(b []byte) (int, error) {
	return gzw.writer.Write(b)
}

// gzip compress responses if the client accepts the gzip encoding in its HTTP request.
func (app *application) gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check that the client set the Accept-Encoding header to "gzip".
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		// Set Content-Encoding and account for caching.
		w.Header().Add("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")

		// Create a new *gzip.Writer and gzipResponseWriter.
		gz := gzip.NewWriter(w)
		defer gz.Close()
		gzw := gzipResponseWriter{
			ResponseWriter: w,
			writer:         gz,
		}

		// Use the gzipResponseWriter in the next handler.
		next.ServeHTTP(gzw, r)
	})
}
