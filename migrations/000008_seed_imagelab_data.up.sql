BEGIN;

INSERT INTO
    consumers (
        id,
        name,
        email,
        status,
        version,
        created_at,
        updated_at
    )
VALUES
    (
        '0198f000-0000-7000-8000-000000000004',
        'ImageLab',
        'api@imagelab.com',
        'active',
        1,
        now() - interval '100 days',
        now() - interval '4 days'
    );

INSERT INTO
    api_keys (
        id,
        consumer_id,
        key_hash,
        key_prefix,
        status,
        last_used_at,
        expires_at,
        created_at
    )
VALUES
    (
        '0198f000-0000-7000-8000-000000000105',
        '0198f000-0000-7000-8000-000000000004',
        'sample_hash_imagelab_active',
        'gk_imagelab_',
        'active',
        now() - interval '3 hours',
        now() + interval '185 days',
        now() - interval '95 days'
    );

COMMIT;