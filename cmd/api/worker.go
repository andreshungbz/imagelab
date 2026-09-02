package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// startReportWorker starts a background goroutine that polls the jobs table for new report jobs to process.
func (app *application) startReportWorker(ctx context.Context) {
	app.wg.Add(1)

	go func() {
		defer app.wg.Done()

		ticker := time.NewTicker(app.config.workerPollInterval)
		defer ticker.Stop()

		// Until shutdown, process the next report job at the configured interval.
		for {
			select {
			case <-ctx.Done():
				app.logger.Info("report worker stopped")
				return
			case <-ticker.C:
				err := app.processNextReportJob(ctx)
				if err != nil && !errors.Is(err, sql.ErrNoRows) && !errors.Is(err, context.Canceled) {
					app.logger.Error("report worker failed", "error", err)
				}
			}
		}
	}()
}

// processNextReportJob claims and processes the next report job from the database.
func (app *application) processNextReportJob(ctx context.Context) error {
	// Claim and log the next report job, handling errors.
	job, err := app.models.Jobs.ClaimNext(ctx)
	if err != nil {
		return err
	}
	app.logger.Info("report job started", "job_id", job.PublicID,
		"artificial_delay", app.config.reportDelay)

	// Apply the artificial report delay if configured to be greater than 0.
	if app.config.reportDelay > 0 {
		timer := time.NewTimer(app.config.reportDelay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
		}
	}

	// Generate the report, marking and logging the job as completed, or marking it as
	// failed if an error occurs.
	report, err := app.models.Reports.Generate(job.ConsumerID, job.Payload.From, job.Payload.To)
	if err != nil {
		return app.models.Jobs.MarkFailed(ctx, job.ID, err.Error())
	}
	result, err := json.Marshal(report)
	if err != nil {
		return app.models.Jobs.MarkFailed(ctx, job.ID, err.Error())
	}
	if err := app.models.Jobs.MarkCompleted(ctx, job.ID, result); err != nil {
		return err
	}
	app.logger.Info("report job completed", "job_id", job.PublicID)

	return nil
}
