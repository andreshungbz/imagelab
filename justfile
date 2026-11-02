# ==================================================================================== #
# SETUP & VARIABLES
# ==================================================================================== #

set dotenv-load
set dotenv-filename := ".envrc"

export IMAGELAB_DB_DSN := env("IMAGELAB_DB_DSN", "")
export PORT := env("PORT", "")
export CORS_TRUSTED_ORIGINS := env("CORS_TRUSTED_ORIGINS", "")
export CONSUMER_ID := env("CONSUMER_ID", "")

ECHO_PREFIX := "[just]"

# ==================================================================================== #
# GENERAL
# ==================================================================================== #

# Print recipe list.
default:
    @just --list --unsorted

# ==================================================================================== #
# DEVELOPMENT
# ==================================================================================== #

# Run the API server.
run:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID"

# Build the API server.
build:
    @echo "{{ ECHO_PREFIX }} Building cmd/api..."
    go build -ldflags='-s' -o=./bin/api ./cmd/api
    GOOS=linux GOARCH=amd64 go build -ldflags='-s' -o=./bin/linux_amd64/api ./cmd/api

# Tidy module dependencies and format all .go files.
tidy:
    @echo "{{ ECHO_PREFIX }} Tidying module dependencies..."
    go mod tidy
    @echo "{{ ECHO_PREFIX }} Verifying and vendoring module dependencies..."
    go mod verify
    # go mod vendor
    @echo "{{ ECHO_PREFIX }} Formatting .go files..."
    go fmt ./...

# Run quality control checks and tests.
audit:
    @echo "{{ ECHO_PREFIX }} Checking module dependencies..."
    go mod tidy -diff
    go mod verify
    @echo "{{ ECHO_PREFIX }} Vetting code..."
    go vet ./...
    # go tool staticcheck ./...
    @echo "{{ ECHO_PREFIX }} Running tests..."
    go test -race -vet=off ./...

# Remove the ./bin and ./storage directories and reset the database.
cleanup:
    @echo "{{ ECHO_PREFIX }} Resetting database..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" down
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" up
    @echo "{{ ECHO_PREFIX }} Cleaning up..."
    rm -rf ./bin
    rm -rf ./storage

# ==================================================================================== #
# DATABASE MIGRATIONS
# ==================================================================================== #

# Connect to the database using psql.
db-psql:
    psql "$IMAGELAB_DB_DSN"

# Create a new database migration.
db-migrations-new name:
    @echo "Creating migration files for {{ name }}..."
    migrate create -seq -ext=.sql -dir=./migrations {{ name }}

# Apply all up database migrations.
db-migrations-up:
    @echo "Running up migrations..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" up

# Apply all down database migrations.
db-migrations-down:
    @echo "Reverting all migrations..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" down

# Go to the specified migration version.
db-migrations-goto version:
    @echo "Going to schema migration version {{ version }}..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" goto {{ version }}

# Force the schema_migrations table version.
db-migrations-fix version:
    @echo "Forcing schema migrations version to {{ version }}..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" force {{ version }}

# ==================================================================================== #
# TESTS
# ==================================================================================== #

# Test the API server with a 3s worker start delay.
test-wrk-del-3s:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-worker-start-delay=3s

# Test the API server with a 3s worker start delay and simulated worker failure.
test-wrk-del-3s-fail:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-worker-start-delay=3s \
      -test-simulated-worker-failure=true

# Test the API server with a 3s image process delay.
test-img-proc-del-3s:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-individual-image-process-delay=3s

# Test the API server with a 3s image process delay and simulated worker failure.
test-img-proc-del-3s-fail:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-simulated-worker-failure=true \
      -test-individual-image-process-delay=3s

# Test the API server with a 3s image process delay and closed SSE stream.
test-img-proc-del-3s-sse-disc:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-individual-image-process-delay=3s \
      -test-sse-disconnect-after-stage=thumbnail_ready

# ==================================================================================== #
# MEASUREMENTS
# ==================================================================================== #

# v1 Measurements
# ==================================================================================== #

# Take measurements of a single image processing job.
meas-v1-single:
    uv run --directory ./python measurement \
      --count 1 \
      --api-url="http://localhost:$PORT" \
      --db-dsn="$IMAGELAB_DB_DSN" \
      --image-path="src/measurement/pittsburgh.jpg"

# Take measurements of 5 concurrent image processing jobs.
meas-v1-five:
    uv run --directory ./python measurement \
      --count 5 \
      --api-url="http://localhost:$PORT" \
      --db-dsn="$IMAGELAB_DB_DSN" \
      --image-path="src/measurement/pittsburgh.jpg"

# v2 Measurements
# ==================================================================================== #

# Condition A: Quiet active interval for 30s with no client-visible progress.
meas-v2-exp-cond-a:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -exp-quiet-delay-enabled=true \
      -exp-quiet-delay-duration=30s

# Condition B: Ordinary processing with real progress after each stored variant.
meas-v2-exp-cond-b:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \

# Condition C1: Slow simulated updates (Updates every 2s for 10s).
meas-v2-exp-cond-c1:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -exp-simulation-phase-enabled=true \
      -exp-simulation-interval=2s \
      -exp-simulation-total-duration=10s

# Condition C2: Fast simulated updates (Updates every 200ms for 10s).
meas-v2-exp-cond-c2:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -exp-simulation-phase-enabled=true \
      -exp-simulation-interval=200ms \
      -exp-simulation-total-duration=10s

# Alias for Condition C3 (Network latency is set be the client/browser).
meas-v2-exp-cond-c3: meas-v2-exp-cond-c2

# Helper to show v2 detection delay results.
show-v2-detect-del:
    uv run --directory ./python show-v2-detection-delays

# v3 Measurements
# ==================================================================================== #

# MEAS-01: v2 Condition A configuration.
meas-v3-cond-a: meas-v2-exp-cond-a

# MEAS-02: v2 Condition B configuration.
meas-v3-cond-b: meas-v2-exp-cond-b

# MEAS-03: v2 Condition C2 configuration.
meas-v3-cond-c: meas-v2-exp-cond-c2

# Helper to show v3 SSE versus long-polling detection delay results.
show-v3-detect-del:
    uv run --directory ./python show-v3-detection-delays
