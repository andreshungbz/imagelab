BEGIN;

CREATE VIEW
    v_job_metrics AS
SELECT
    id,
    public_id,
    job_type,
    status,
    created_at AS queued_at,
    started_at,
    completed_at,
    failed_at,
    -- Queue Wait (ms): started_at - queued_at
    ROUND(
        EXTRACT(
            EPOCH
            FROM
                (started_at - created_at)
        ) * 1000
    ) AS queue_wait_ms,
    -- Processing Duration (ms): completed_at or failed_at - started_at
    ROUND(
        EXTRACT(
            EPOCH
            FROM
                (COALESCE(completed_at, failed_at) - started_at)
        ) * 1000
    ) AS processing_duration_ms,
    -- Job Duration (ms): completed_at or failed_at - queued_at
    ROUND(
        EXTRACT(
            EPOCH
            FROM
                (COALESCE(completed_at, failed_at) - created_at)
        ) * 1000
    ) AS job_duration_ms
FROM
    jobs;

COMMIT;
