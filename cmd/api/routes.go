package main

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// routes returns the HTTP router configured with all handlers, route-specific middleware, and global middleware.
func (app *application) routes() http.Handler {
	router := httprouter.New()

	// BACKEND

	// Standard routes
	router.NotFound = http.HandlerFunc(app.notFoundResponse)
	router.MethodNotAllowed = http.HandlerFunc(app.methodNotAllowedResponse)
	router.HandlerFunc(http.MethodGet, "/v1/healthcheck", app.healthcheckHandler)

	// DATABASE SCHEMA ROUTES

	// Consumer routes
	router.HandlerFunc(http.MethodPost, "/v1/consumers", app.createConsumerHandler)

	// Report routes
	// router.HandlerFunc(http.MethodPost, "/v1/reports", app.createReportHandler)

	// Job routes
	router.HandlerFunc(http.MethodGet, "/v1/jobs/:id", app.getJobHandler)

	// Image routes
	router.HandlerFunc(http.MethodPost, "/v1/images", app.processImageHandler)
	router.HandlerFunc(http.MethodGet, "/v1/images/:image_id/variants/:image_variant", app.getImageVariantHandler)

	// GLOBAL MIDDLEWARE

	return app.requestLogger( // First middleware
		app.enableCORS(router), // Last middleware
	)
}
