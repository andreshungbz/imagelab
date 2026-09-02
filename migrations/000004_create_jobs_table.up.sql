-- Filename: 000004_create_jobs_table.up.sql
BEGIN;

CREATE TABLE IF NOT EXISTS
    jobs (
        /*
        Exposing this job identifier can be a security risk, as jobs are typically frequent
        and the timestamp component in UUIDv7 can be used to infer business perfomance metrics.
         */
        id uuid PRIMARY KEY DEFAULT uuidv7 (),
        -- Every job is mandatorily associated with a consumer. 
        consumer_id uuid NOT NULL REFERENCES consumers (id),
        job_type text NOT NULL,
        -- A newly created job has a queued status by default.
        status job_status NOT NULL DEFAULT 'queued',
        -- JSONB types used here allows the database to be able to index and query the payload and result data efficiently.
        payload jsonb NOT NULL DEFAULT '{}',
        result jsonb,
        error_message text,
        -- Timestamp fields for keeping track of job processing.
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );

COMMIT;