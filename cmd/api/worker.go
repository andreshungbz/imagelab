package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/andreshungbz/imagelab/internal/data"
)

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

	app.logger.Info("image job started", "job_id", job.PublicID, "artificial_delay", app.config.imageDelay)

	// Apply the artificial image delay if configured to be greater than 0.
	if app.config.imageDelay > 0 {
		timer := time.NewTimer(app.config.imageDelay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
		}
	}

	// Generate image variants, marking the job as completed or failed appropriately.
	result, err := app.models.ImageVariants.GenerateVariants(imgPayload.ImageID, imgPayload.SourcePath, imgPayload.Variants)
	err = fmt.Errorf("simulated worker error") // TEST: Worker Failure
	if err != nil {
		return app.models.Jobs.MarkFailed(ctx, job.ID, err.Error())
	}
	if err := app.models.Jobs.MarkCompleted(ctx, job.ID, result); err != nil {
		return err
	}
	app.logger.Info("image job completed", "job_id", job.PublicID)

	return nil
}
