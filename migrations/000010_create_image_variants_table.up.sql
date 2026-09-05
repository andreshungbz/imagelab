BEGIN;

CREATE TABLE IF NOT EXISTS
    image_variants (
        id BIGSERIAL PRIMARY KEY,
        image_id BIGINT NOT NULL REFERENCES images (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

COMMIT;