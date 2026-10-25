# Makefile
# Structure adapted from https://lets-go-further.alexedwards.net/ (2025)

# ==================================================================================== #
# ENVIRONMENT & VARIABLES
# ==================================================================================== #

include .envrc

ECHO_PREFIX = [make]

# ==================================================================================== #
# HELPERS
# ==================================================================================== #

## help: Print this help message
.PHONY: help
help:
	@echo 'Usage:'
	@sed -n 's/^##//p' ${MAKEFILE_LIST} | column -t -s ':' | sed -e 's/^/ /'

# ==================================================================================== #
# DEVELOPMENT
# ==================================================================================== #

## run: Run the cmp/api application
.PHONY: run
run:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID}

## cleanup: Remove the ./bin and ./storage directories and reset the database
.PHONY: cleanup
cleanup:
	@echo '${ECHO_PREFIX} Resetting database...'
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} down
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} up
	@echo '${ECHO_PREFIX} Cleaning up...'
	rm -rf ./bin
	rm -rf ./storage

# ==================================================================================== #
# DATABASE MIGRATIONS
# ==================================================================================== #

## db/psql: Connect to the database using psql
.PHONY: db/psql
db/psql:
	psql ${IMAGELAB_DB_DSN}

## db/migrations/new name=$1: Create a new database migration
.PHONY: db/migrations/new
db/migrations/new:
	@echo 'Creating migration files for ${name}...'
	migrate create -seq -ext=.sql -dir=./migrations ${name}

## db/migrations/up: Apply all up database migrations
.PHONY: db/migrations/up
db/migrations/up:
	@echo 'Running up migrations...'
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} up

## db/migrations/down: Apply all down database migrations
.PHONY: db/migrations/down
db/migrations/down:
	@echo 'Reverting all migrations...'
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} down

## db/migrations/goto version=$1: Go to the specified migration version
.PHONY: db/migrations/goto
db/migrations/goto:
	@echo 'Going to schema migration version ${version}...'
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} goto ${version}

## db/migrations/fix version=$1: Force the schema_migrations table version
.PHONY: db/migrations/fix
db/migrations/fix:
	@echo 'Forcing schema migrations version to ${version}...'
	migrate -path ./migrations -database ${IMAGELAB_DB_DSN} force ${version}

# ==================================================================================== #
# QUALITY CONTROL
# ==================================================================================== #

## tidy: Tidy module dependencies and format all .go files
.PHONY: tidy
tidy:
	@echo '${ECHO_PREFIX} Tidying module dependencies...'
	go mod tidy
	@echo '${ECHO_PREFIX} Verifying and vendoring module dependencies...'
	go mod verify
# 	go mod vendor
	@echo '${ECHO_PREFIX} Formatting .go files...'
	go fmt ./...

## audit: Run quality control checks and tests
.PHONY: audit
audit:
	@echo '${ECHO_PREFIX} Checking module dependencies...'
	go mod tidy -diff
	go mod verify
	@echo '${ECHO_PREFIX} Vetting code...'
	go vet ./...
# 	go tool staticcheck ./...
	@echo '${ECHO_PREFIX} Running tests...'
	go test -race -vet=off ./...

# ==================================================================================== #
# BUILD
# ==================================================================================== #

## build/api: Build the cmd/api application
.PHONY: build/api
build/api:
	@echo '${ECHO_PREFIX} Building cmd/api...'
	go build -ldflags='-s' -o=./bin/api ./cmd/api
	GOOS=linux GOARCH=amd64 go build -ldflags='-s' -o=./bin/linux_amd64/api ./cmd/api

# ==================================================================================== #
# TESTS
# ==================================================================================== #

.PHONY: test/delay-3s
test/delay-3s:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-test-worker-start-delay=3s

.PHONY: test/delay-3s/simulated-worker-failure
test/delay-3s/simulated-worker-failure:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-test-worker-start-delay=3s \
		-test-simulated-worker-failure=true

.PHONY: test/image-process-delay-3s
test/image-process-delay-3s:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-test-individual-image-process-delay=3s

.PHONY: test/image-process-delay-3s-simulated-worker-failure
test/image-process-delay-3s-simulated-worker-failure:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-test-individual-image-process-delay=3s \
		-test-simulated-worker-failure=true

.PHONY: test/image-process-delay-3s-sse-disconnect-thumbnail
test/image-process-delay-3s-sse-disconnect-thumbnail:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-test-individual-image-process-delay=3s \
		-test-sse-disconnect-after-stage=thumbnail_ready

# ==================================================================================== #
# MEASUREMENTS
# ==================================================================================== #

.PHONY: measure/sp/one
measure/sp/one:
	uv run --directory ./python measurement \
		--count 1 \
		--api-url="http://localhost:${PORT}" \
		--db-dsn="${IMAGELAB_DB_DSN}" \
		--image-path="src/measurement/pittsburgh.jpg"

.PHONY: measure/sp/five
measure/sp/five:
	uv run --directory ./python measurement \
		--count 5 \
		--api-url="http://localhost:${PORT}" \
		--db-dsn="${IMAGELAB_DB_DSN}" \
		--image-path="src/measurement/pittsburgh.jpg"

# ==================================================================================== #
# EXPERIMENTAL CONTROLS (EXP-01 – EXP-03)
# ==================================================================================== #

# MEAS-01 / Condition A: Quiet active interval for 30s with no client-visible progress.
.PHONY: exp/cond-a
exp/cond-a:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-exp-quiet-delay-enabled=true \
		-exp-quiet-delay-duration=30s

# MEAS-02 / Condition B: Ordinary processing with real progress after each stored variant.
.PHONY: exp/cond-b
exp/cond-b:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \

# Run Condition C1: Slow simulated updates (Updates every 2s for 10s)
.PHONY: exp/cond-c1
exp/cond-c1:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-exp-simulation-phase-enabled=true \
		-exp-simulation-interval=2s \
		-exp-simulation-total-duration=10s

# MEAS-03 / Condition C2: Labelled simulated progress every 200ms for 10s.
.PHONY: exp/cond-c2
exp/cond-c2:
	go run ./cmd/api \
		-db-dsn=${IMAGELAB_DB_DSN} \
		-port=${PORT} \
		-cors-trusted-origins=${CORS_TRUSTED_ORIGINS} \
		-consumer-id=${CONSUMER_ID} \
		-exp-simulation-phase-enabled=true \
		-exp-simulation-interval=200ms \
		-exp-simulation-total-duration=10s

# Alias for Condition C3 (Same server config as C2; network latency is injected on client/browser)
.PHONY: exp/cond-c3
exp/cond-c3: exp/cond-c2

# ==================================================================================== #
# V3 MEASUREMENT CONDITION ALIASES (MEAS-01 – MEAS-03)
# ==================================================================================== #

# MEAS-01: V3 alias for the existing quiet Condition A server configuration.
.PHONY: v3/meas-01
v3/meas-01: exp/cond-a

# MEAS-02: V3 alias for the existing ordinary Condition B server configuration.
.PHONY: v3/meas-02
v3/meas-02: exp/cond-b

# MEAS-03: V3 alias for the existing fast simulated Condition C2 server configuration.
.PHONY: v3/meas-03
v3/meas-03: exp/cond-c2

# Helper to show v2 detection delay results.
.PHONY: show-v2-detection-delays
show-v2-detection-delays:
		uv run --directory ./python show-v2-detection-delays
