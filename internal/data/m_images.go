package data

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Image represents a record in the images table of the database.
type Image struct {
	ID               int64     `json:"id"`
	OriginalFilename string    `json:"original_filename"`
	StoredFilename   string    `json:"stored_filename"`
	MIMEType         string    `json:"mime_type"`
	SizeBytes        int64     `json:"size_bytes"`
	CreatedAt        time.Time `json:"created_at"`
}

// ImageModel wraps a sql.DB connection pool used to interact with the database.
type ImageModel struct {
	DB *sql.DB
}

// Insert writes a new image record to the database.
func (m ImageModel) Insert(image *Image) error {
	// Construct the query and context.
	query := `
		INSERT INTO images (original_filename, stored_filename, mime_type, size_bytes)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Construct the query arguments.
	args := []any{
		image.OriginalFilename,
		image.StoredFilename,
		image.MIMEType,
		image.SizeBytes,
	}

	// Execute the query and scan the returned values into the passed image struct.
	return m.DB.QueryRowContext(ctx, query, args...).Scan(&image.ID, &image.CreatedAt)
}

// GetByID retrieves an image record by its ID.
func (m ImageModel) GetByID(id int64) (*Image, error) {
	// Construct the query and context.
	query := `
		SELECT id, original_filename, stored_filename, mime_type, size_bytes, created_at
		FROM images
		WHERE id = $1`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute the query and scan the returned values into a new Image struct,
	// handling missing records and other errors as a catch-all.
	var img Image
	err := m.DB.QueryRowContext(ctx, query, id).Scan(
		&img.ID,
		&img.OriginalFilename,
		&img.StoredFilename,
		&img.MIMEType,
		&img.SizeBytes,
		&img.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}

	return &img, nil
}
