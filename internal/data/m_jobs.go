package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/lib/pq"
)

// ReportPayload represents the expected payload structure for a consumer activity report job.
type ReportPayload struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`
}

// ImagePayload represents the expected payload structure for an image processing job.
type ImagePayload struct {
	ImageID    string   `json:"image_id"`
	SourcePath string   `json:"source_path"`
	Variants   []string `json:"variants"`
}

// Job represents a record in the jobs table of the database.
type Job struct {
	ID           string          `json:"-"`
	PublicID     string          `json:"id"`
	ConsumerID   string          `json:"consumer_id"`
	JobType      string          `json:"job_type"`
	Status       string          `json:"status"`
	Payload      ReportPayload   `json:"payload"`
	Result       json.RawMessage `json:"result,omitempty"`
	ErrorMessage *string         `json:"error_message,omitempty"`
	StartedAt    *time.Time      `json:"started_at,omitempty"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

// JobModel wraps a sql.DB connection pool used to interact with the database.
type JobModel struct {
	DB *sql.DB
}

// Insert writes a new job record to the database.
func (m JobModel) Insert(job *Job) error {
	payload, err := json.Marshal(job.Payload)
	if err != nil {
		return err
	}

	// Construct the query and context.
	query := `INSERT INTO jobs (consumer_id, job_type, payload)
		VALUES ($1, $2, $3) RETURNING id, public_id, status, created_at`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute the query and scan the returned values into the passed job struct,
	// handling consumer ID foreign key violations (non-existent consumer) and
	// other errors as a catch-all.
	err = m.DB.QueryRowContext(ctx, query, job.ConsumerID, job.JobType, payload).Scan(
		&job.ID, &job.PublicID, &job.Status, &job.CreatedAt,
	)
	if err != nil {
		var pgErr *pq.Error
		// 23503 is the PostgreSQL error code for foreign_key_violation.
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return ErrRecordNotFound
		}
		return err
	}

	return nil
}

// GetByPublicID reads a job record from the database based on the provided public ID.
func (m JobModel) GetByPublicID(publicID string) (*Job, error) {
	// Construct the query and context.
	query := `SELECT id, public_id, consumer_id, job_type, status, payload,
		COALESCE(result, 'null'::jsonb), error_message, started_at, completed_at, created_at
		FROM jobs WHERE public_id = $1`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute the query and scan the returned values into a new job struct,
	// handling missing records and other errors as a catch-all. The payload field
	// needs to be unmarshaled from JSON since ReportPayload is a Go struct. On the other
	// hand, the result field is already a json.RawMessage type, so it can be scanned directly.
	var job Job
	var payload []byte
	err := m.DB.QueryRowContext(ctx, query, publicID).Scan(&job.ID, &job.PublicID,
		&job.ConsumerID, &job.JobType, &job.Status, &payload, &job.Result,
		&job.ErrorMessage, &job.StartedAt, &job.CompletedAt, &job.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}
	if err := json.Unmarshal(payload, &job.Payload); err != nil {
		return nil, err
	}

	return &job, nil
}

// ClaimNext retrieves the next queued job of a specified type from the database.
func (m JobModel) ClaimNext(ctx context.Context, jobType string) (*Job, error) {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Construct the query.
	query := `SELECT id, public_id, consumer_id, job_type, payload FROM jobs
		WHERE status = 'queued' AND job_type = $1
		ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`

	// Execute the query, scan the returned values into a new job struct, update job status to 'processing',
	// and handle other errors as a catch-all. The payload field needs to be unmarshaled
	// from JSON since ReportPayload is a Go struct.
	var job Job
	var payload []byte
	if err := tx.QueryRowContext(ctx, query, jobType).Scan(&job.ID, &job.PublicID,
		&job.ConsumerID, &job.JobType, &payload); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(payload, &job.Payload); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE jobs SET status = 'processing', started_at = now() WHERE id = $1`, job.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	job.Status = "processing"

	return &job, nil
}

// MarkCompleted updates the status of a job to "completed" in the database and sets its result.
func (m JobModel) MarkCompleted(ctx context.Context, id string, result []byte) error {
	_, err := m.DB.ExecContext(ctx,
		`UPDATE jobs SET status = 'completed', result = $2, completed_at = now() WHERE id = $1`,
		id, result)
	return err
}

// MarkFailed updates the status of a job to "failed" in the database and sets its error message.
func (m JobModel) MarkFailed(ctx context.Context, id, message string) error {
	_, err := m.DB.ExecContext(ctx,
		`UPDATE jobs SET status = 'failed', error_message = $2, failed_at = now() WHERE id = $1`,
		id, message)
	return err
}
