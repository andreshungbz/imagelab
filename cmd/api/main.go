package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/andreshungbz/imagelab/internal/data"
	"github.com/andreshungbz/imagelab/internal/vcs"
	_ "github.com/lib/pq"
)

var (
	version = vcs.Version()
)

// config stores the API server configuration.
type config struct {
	port int    // API server port
	env  string // (development|staging|production)
	// reportDelay        time.Duration // Artificial report generation delay
	imageDelay         time.Duration // Artificial image processing delay
	workerPollInterval time.Duration // Interval for the report worker to poll for queued jobs
	consumerID         string        // Consumer ID for testing purposes
	db                 struct {
		dsn          string        // Data source name
		maxOpenConns int           // Maximum number of open connections to the database
		maxIdleConns int           // Maximum number of idle connections in the connection pool
		maxIdleTime  time.Duration // Maximum amount of time a connection may be idle
	}
	cors struct {
		trustedOrigins []string
	}
}

// application holds the dependencies for the HTTP handlers, helpers, middleware, etc.
// so that they are all accessible through dependency injection.
type application struct {
	config config
	logger *slog.Logger
	models data.Models    // Data models for the application
	wg     sync.WaitGroup // Synchronization primitive to manage goroutines
	// reportWorkerCancel context.CancelFunc // Worker cancellation function to stop the report worker gracefully
	imageWorkerCancel context.CancelFunc // Worker cancellation function to stop the image worker gracefully
}

func main() {
	var cfg config

	// FLAGS

	// Server flags
	flag.IntVar(&cfg.port, "port", 4000, "API server port")
	flag.StringVar(&cfg.env, "env", "development", "Environment (development|staging|production)")

	// Database flags
	flag.StringVar(&cfg.db.dsn, "db-dsn", "", "PostgreSQL DSN")
	flag.IntVar(&cfg.db.maxOpenConns, "db-max-open-conns", 25, "PostgreSQL max open connections")
	flag.IntVar(&cfg.db.maxIdleConns, "db-max-idle-conns", 25, "PostgreSQL max idle connections")
	flag.DurationVar(&cfg.db.maxIdleTime, "db-max-idle-time", 15*time.Minute, "PostgreSQL max connection idle time")

	// Version flag
	displayVersion := flag.Bool("version", false, "Display program version")

	// Worker flags
	// flag.DurationVar(&cfg.reportDelay, "report-delay", 0, "Artificial report-generation delay")
	flag.DurationVar(&cfg.imageDelay, "image-delay", 0, "Artificial image processing delay")
	flag.DurationVar(&cfg.workerPollInterval, "worker-poll-interval", 250*time.Millisecond, "Worker queue-check interval")

	// Consumer flag
	flag.StringVar(&cfg.consumerID, "consumer-id", "", "Consumer ID for testing purposes")

	// CORS trusted origins flag
	flag.Func("cors-trusted-origins", "Trusted CORS origins (space separated)", func(val string) error {
		cfg.cors.trustedOrigins = strings.Fields(val)
		return nil
	})

	flag.Parse()

	// Display program version and exit if the --version flag was passed.
	if *displayVersion {
		fmt.Printf("version:\t%s\n", version)
		os.Exit(0)
	}

	// JSON logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// DATABASE

	db, err := openDB(cfg)
	if err != nil {
		logger.Error(err.Error())
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("database connection pool established")

	// APPLICATION

	app := &application{
		config: cfg,
		logger: logger,
		models: data.NewModels(db),
	}

	// Start the report worker (in a separate goroutine) with a cancellable context.
	// workerCtx, cancelWorker := context.WithCancel(context.Background())
	// app.reportWorkerCancel = cancelWorker
	// defer cancelWorker()
	// app.startReportWorker(workerCtx)

	// Start the image worker (in a separate goroutine) with a cancellable context.
	imageCtx, cancelImage := context.WithCancel(context.Background())
	app.imageWorkerCancel = cancelImage
	defer cancelImage()
	app.startImageWorker(imageCtx)

	// Start the API server.
	err = app.serve()
	if err != nil {
		logger.Error(err.Error())
		os.Exit(1)
	}
}

// openDB connects to the PostgreSQL database using the provided DSN.
func openDB(cfg config) (*sql.DB, error) {
	db, err := sql.Open("postgres", cfg.db.dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(cfg.db.maxOpenConns)
	db.SetMaxIdleConns(cfg.db.maxIdleConns)
	db.SetConnMaxIdleTime(cfg.db.maxIdleTime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test the connection with a ping.
	err = db.PingContext(ctx)
	if err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}
