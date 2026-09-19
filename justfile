# Justfile
# Structure adapted from https://lets-go-further.alexedwards.net/ (2025)

set dotenv-load
set dotenv-filename := ".envrc"

export IMAGELAB_DB_DSN := env("IMAGELAB_DB_DSN", "")
export PORT := env("PORT", "")
export CORS_TRUSTED_ORIGINS := env("CORS_TRUSTED_ORIGINS", "")
export CONSUMER_ID := env("CONSUMER_ID", "")

ECHO_PREFIX := "[just]"

# ==================================================================================== #
# HELPERS
# ==================================================================================== #

# Print this help message
default:
    @just --list

# ==================================================================================== #
# DEVELOPMENT
# ==================================================================================== #

# Run the cmd/api application
run:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID"

# ==================================================================================== #
# DATABASE MIGRATIONS
# ==================================================================================== #

# Connect to the database using psql
db-psql:
    psql "$IMAGELAB_DB_DSN"

# Create a new database migration
db-migrations-new name:
    @echo "Creating migration files for {{ name }}..."
    migrate create -seq -ext=.sql -dir=./migrations {{ name }}

# Apply all up database migrations
db-migrations-up:
    @echo "Running up migrations..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" up

# Apply all down database migrations
db-migrations-down:
    @echo "Reverting all migrations..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" down

# Go to the specified migration version
db-migrations-goto version:
    @echo "Going to schema migration version {{ version }}..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" goto {{ version }}

# Force the schema_migrations table version
db-migrations-fix version:
    @echo "Forcing schema migrations version to {{ version }}..."
    migrate -path ./migrations -database "$IMAGELAB_DB_DSN" force {{ version }}

# ==================================================================================== #
# QUALITY CONTROL
# ==================================================================================== #

# Tidy module dependencies and format all .go files
tidy:
    @echo "{{ ECHO_PREFIX }} Tidying module dependencies..."
    go mod tidy
    @echo "{{ ECHO_PREFIX }} Verifying and vendoring module dependencies..."
    go mod verify
    # go mod vendor
    @echo "{{ ECHO_PREFIX }} Formatting .go files..."
    go fmt ./...

# Run quality control checks and tests
audit:
    @echo "{{ ECHO_PREFIX }} Checking module dependencies..."
    go mod tidy -diff
    go mod verify
    @echo "{{ ECHO_PREFIX }} Vetting code..."
    go vet ./...
    # go tool staticcheck ./...
    @echo "{{ ECHO_PREFIX }} Running tests..."
    go test -race -vet=off ./...

# ==================================================================================== #
# BUILD
# ==================================================================================== #

# Build the cmd/api application
build-api:
    @echo "{{ ECHO_PREFIX }} Building cmd/api..."
    go build -ldflags='-s' -o=./bin/api ./cmd/api
    GOOS=linux GOARCH=amd64 go build -ldflags='-s' -o=./bin/linux_amd64/api ./cmd/api

# ==================================================================================== #
# TESTS
# ==================================================================================== #

test-delay-3s:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-image-process-delay=3s

test-worker-failure-3s:
    go run ./cmd/api \
      -db-dsn="$IMAGELAB_DB_DSN" \
      -port="$PORT" \
      -cors-trusted-origins="$CORS_TRUSTED_ORIGINS" \
      -consumer-id="$CONSUMER_ID" \
      -test-image-process-delay=3s \
      -test-worker-failure=true

# ==================================================================================== #
# MEASUREMENTS
# ==================================================================================== #

measure-baseline:
    uv run --directory ./python measurement \
      --count 1 \
      --api-url="http://localhost:$PORT" \
      --db-dsn="$IMAGELAB_DB_DSN" \
      --image-path="src/measurement/pittsburgh.jpg"

measure-concurrent:
    uv run --directory ./python measurement \
      --count 5 \
      --api-url="http://localhost:$PORT" \
      --db-dsn="$IMAGELAB_DB_DSN" \
      --image-path="src/measurement/pittsburgh.jpg"
