package data

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lib/pq"
)

// ImageVariant represents a record in the image_variants table of the database.
type ImageVariant struct {
	ID             int64     `json:"id"`
	ImageID        int64     `json:"image_id"`
	Name           string    `json:"name"`
	StoredFilename string    `json:"stored_filename"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	SizeBytes      int64     `json:"size_bytes"`
	CreatedAt      time.Time `json:"created_at"`
}

// ImageVariantModel wraps a sql.DB connection pool used to interact with the database.
type ImageVariantModel struct {
	DB *sql.DB
}

// Insert writes a new image variant record to the database.
func (m ImageVariantModel) Insert(variant *ImageVariant) error {
	// Construct the query and context.
	query := `
		INSERT INTO image_variants (image_id, name, stored_filename, width, height, size_bytes)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Construct the query arguments.
	args := []any{
		variant.ImageID,
		variant.Name,
		variant.StoredFilename,
		variant.Width,
		variant.Height,
		variant.SizeBytes,
	}

	// Execute the query and scan the returned values into the passed ImageVariant struct.
	err := m.DB.QueryRowContext(ctx, query, args...).Scan(&variant.ID, &variant.CreatedAt)
	if err != nil {
		var pgErr *pq.Error
		// PostgreSQL foreign key violation code for non-existent image_id reference.
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return ErrRecordNotFound
		}
		return err
	}

	return nil
}

// GetByImageIDAndName retrieves a specific variant record matching an image ID and variant name.
func (m ImageVariantModel) GetByImageIDAndName(imageID int64, name string) (*ImageVariant, error) {
	// Construct the query and context.
	query := `
		SELECT id, image_id, name, stored_filename, width, height, size_bytes, created_at
		FROM image_variants
		WHERE image_id = $1 AND name = $2`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute the query and scan the returned values into an ImageVariant struct.
	var v ImageVariant
	err := m.DB.QueryRowContext(ctx, query, imageID, name).Scan(
		&v.ID,
		&v.ImageID,
		&v.Name,
		&v.StoredFilename,
		&v.Width,
		&v.Height,
		&v.SizeBytes,
		&v.CreatedAt,
	)
	if err != nil {
		// image ID not found in the database
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}

	return &v, nil
}

// GetAllByImageID returns all variants associated with an image.
func (m ImageVariantModel) GetAllByImageID(imageID int64) ([]*ImageVariant, error) {
	// Construct the query and context.
	query := `
		SELECT id, image_id, name, stored_filename, width, height, size_bytes, created_at
		FROM image_variants
		WHERE image_id = $1
		ORDER BY id ASC`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute the query returning multiple rows.
	rows, err := m.DB.QueryContext(ctx, query, imageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Scan each row into an ImageVariant struct and append it to a slice.
	var variants []*ImageVariant
	for rows.Next() {
		var v ImageVariant
		err := rows.Scan(
			&v.ID,
			&v.ImageID,
			&v.Name,
			&v.StoredFilename,
			&v.Width,
			&v.Height,
			&v.SizeBytes,
			&v.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		variants = append(variants, &v)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}

	return variants, nil
}
