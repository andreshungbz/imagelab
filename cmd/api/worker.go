package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/andreshungbz/imagelab/internal/data"
)

// Create a struct representing the expected job result structure.
type variantResult struct {
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	URL    string `json:"url"`
}

// startImageWorker starts a background goroutine that polls the jobs table for new image jobs to process.
func (app *application) startImageWorker(ctx context.Context) {
	// WaitGroup.Go automatically handles WaitGroup.Add and WaitGroup.Done.
	app.wg.Go(func() {
		// Setup the ticker to poll for new image jobs at the configured interval.
		ticker := time.NewTicker(app.config.workerPollInterval)
		defer ticker.Stop()

		// Until shutdown, process the next image job.
		for {
			select {
			case <-ctx.Done():
				app.logger.Info("image worker stopped")
				return
			case <-ticker.C:
				err := app.processNextImageJob(ctx)
				if err != nil && !errors.Is(err, sql.ErrNoRows) && !errors.Is(err, context.Canceled) {
					app.logger.Error("image worker failed", "error", err)
				}
			}
		}
	})
}

// processNextImageJob claims and processes the next image job from the database.
func (app *application) processNextImageJob(ctx context.Context) error {
	// Claim and log the next image job, handling errors.
	job, err := app.models.Jobs.ClaimNext(ctx, "process_image_variants")
	if err != nil {
		return err
	}

	// Assert that the payload is an ImagePayload.
	imgPayload, ok := job.Payload.(data.ImagePayload)
	if !ok {
		return fmt.Errorf("unexpected payload structure for job type %q", job.JobType)
	}

	app.logger.Info("image job started",
		"job_id", job.PublicID,
		"exp_quiet_delay", app.config.exp_quiet_delay_enabled,
		"exp_simulation_phase", app.config.exp_simulation_phase_enabled,
	)

	// ====================================================================================
	// EXP-01, EXP-02, EXP-03: Simulated Update Phase (Conditions C1, C2, C3)
	// ====================================================================================
	if app.config.exp_simulation_phase_enabled {
		app.logger.Info("starting experimental simulation phase",
			"job_id", job.PublicID,
			"interval", app.config.exp_simulation_interval,
			"duration", app.config.exp_simulation_total_duration,
		)

		simTicker := time.NewTicker(app.config.exp_simulation_interval)
		defer simTicker.Stop()
		simEndTime := time.Now().Add(app.config.exp_simulation_total_duration)
		simStep := 0

		for time.Now().Before(simEndTime) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-simTicker.C:
				simStep++

				// EXP-02: Persist simulated progress step and increment version in DB.
				if err := app.models.Jobs.UpdateSimulatedProgress(ctx, job.ID, simStep); err != nil {
					return fmt.Errorf("failed to update simulated progress: %w", err)
				}

				// EXP-02: Log actual commit time (milliseconds) rather than assuming ideal timer intervals.
				commitTime := time.Now().UnixMilli()

				// Update in-memory struct state
				job.Version++
				job.SimulatedProgress = simStep

				app.logger.Info("simulated progress commit",
					"job_id", job.PublicID,
					"version", job.Version,
					"simulated_progress", simStep,
					"commit_time_ms", commitTime,
				)
			}
		}
		simTicker.Stop()
	}

	// ====================================================================================
	// EXP-01: 30-Second Quiet Delay (Condition A)
	// ====================================================================================
	if app.config.exp_quiet_delay_enabled {
		app.logger.Info("starting quiet delay phase", "job_id", job.PublicID, "duration", app.config.exp_quiet_delay_duration)
		timer := time.NewTimer(app.config.exp_quiet_delay_duration)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
			// 30 seconds pass without emitting DB progress
		}
	}

	// Artificial baseline job start delay (if configured separately)
	if app.config.test_job_start_delay > 0 {
		timer := time.NewTimer(app.config.test_job_start_delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}

	// ====================================================================================
	// EXP-03:Real Image Variant Generation
	// ====================================================================================
	results := make([]variantResult, 0, len(imgPayload.Variants))
	totalVariants := len(imgPayload.Variants)
	for i, name := range imgPayload.Variants {
		// Apply the artificial individual image variant process delay if configured to be greater than 0.
		if app.config.test_individual_image_process_delay > 0 {
			timer := time.NewTimer(app.config.test_individual_image_process_delay)
			defer timer.Stop()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-timer.C:
			}
		}

		// Generate the individual variant.
		v, err := app.models.ImageVariants.GenerateVariant(imgPayload.ImageID, imgPayload.SourcePath, name)
		if err != nil {
			break
		}

		// Construct the variant result and append it to the results slice.
		result := variantResult{
			Name:   v.Name,
			Width:  v.Width,
			Height: v.Height,
			URL:    fmt.Sprintf("/v1/images/%d/variants/%s", imgPayload.ImageID, v.Name),
		}
		results = append(results, result)

		// Update job's result in the database.
		variantJSON, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			err = marshalErr
			break
		}

		stageName := fmt.Sprintf("%s_ready", name)
		isLastVariant := (i == totalVariants-1)
		if isLastVariant {
			// Job Completion
			// PROG-02, EXP-03: The last variant milestone shares one transaction with the completed status.
			if err = app.models.Jobs.MarkCompletedWithProgress(ctx, job.ID, stageName, len(results), variantJSON); err != nil {
				break
			}
		} else {
			// Intermediate progress milestone update.
			if err = app.models.Jobs.UpdateProgress(ctx, job.ID, stageName, len(results), variantJSON); err != nil {
				break
			}
		}

		// Update in-memory job struct.
		job.Version++
		job.Stage = stageName
		job.VariantsCompleted = len(results)
		job.Result, err = json.Marshal(results)
		if err != nil {
			break
		}
	}

	// Apply worker failure simulation if configured.
	if app.config.test_simulated_worker_failure {
		err = fmt.Errorf("simulated worker error")
	}

	// Job Failure
	if err != nil {
		app.logger.Info("image job failed; preserving partial progress", "job_id", job.PublicID, "error", err)

		// Update in-memory struct state.
		job.Status = "failed"
		job.Version++

		// PROG-03: Mark job failed in DB while preserving existing variants and DB progress.
		return app.models.Jobs.MarkFailed(ctx, job.ID, err.Error())
	}

	app.logger.Info("image job completed", "job_id", job.PublicID)
	return nil
}
