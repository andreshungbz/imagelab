package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
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

// GenerateVariant processes, saves, and inserts a single image variant into the database.
func (m ImageVariantModel) GenerateVariant(imageID int64, sourcePath string, variantName string) (*ImageVariant, error) {
	// Open the source file and decode the image.
	srcFile, err := os.Open(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open source file: %w", err)
	}
	defer srcFile.Close()
	srcImg, _, err := image.Decode(srcFile)
	if err != nil {
		return nil, fmt.Errorf("failed to decode source image: %w", err)
	}

	// Generate the specified image variant.
	var transformed image.Image
	switch variantName {
	case "thumbnail":
		transformed = cropCenterSquare(srcImg, 150)
	case "preview":
		transformed = fitBounds(srcImg, 800, 600)
	case "display":
		transformed = fitBounds(srcImg, 1200, 900)
	default:
		return nil, fmt.Errorf("unsupported variant name: %s", variantName)
	}

	// Create the output directory and extension for the image variant.
	outDir := filepath.Join("storage", "variants", fmt.Sprintf("%d", imageID))
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create variants directory: %w", err)
	}
	ext := strings.ToLower(filepath.Ext(sourcePath))
	if ext == ".jpg" {
		ext = ".jpeg"
	}
	destPath := filepath.Join(outDir, fmt.Sprintf("%s%s", variantName, ext))

	// Save the image variant to the server.
	if err := encodeAndSaveImage(destPath, transformed); err != nil {
		return nil, fmt.Errorf("failed to save variant %s: %w", variantName, err)
	}

	// Get the file info of the saved variant and create an ImageVariant struct.
	variantImageInfo, err := os.Stat(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat variant file: %w", err)
	}
	bounds := transformed.Bounds()
	variant := &ImageVariant{
		ImageID:        imageID,
		Name:           variantName,
		StoredFilename: destPath,
		Width:          bounds.Dx(),
		Height:         bounds.Dy(),
		SizeBytes:      variantImageInfo.Size(),
	}

	// Insert the new image_variant record into the database.
	if err := m.Insert(variant); err != nil {
		return nil, fmt.Errorf("failed to insert variant record to DB: %w", err)
	}

	return variant, nil
}

// GenerateVariants generates each requested variant and constructs the JSON-serializable job result.
func (m ImageVariantModel) GenerateVariants(imageID int64, sourcePath string, variants []string) ([]byte, error) {
	// Create an anonymous struct representing the expected job result structure.
	type variantResult struct {
		Name   string `json:"name"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
		URL    string `json:"url"`
	}

	// Generate all variants and collect the results.
	results := make([]variantResult, 0, len(variants))
	for _, name := range variants {
		v, err := m.GenerateVariant(imageID, sourcePath, name)
		if err != nil {
			return nil, err
		}

		results = append(results, variantResult{
			Name:   v.Name,
			Width:  v.Width,
			Height: v.Height,
			URL:    fmt.Sprintf("/v1/images/%d/variants/%s", imageID, v.Name),
		})
	}

	return json.Marshal(results)
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
		// image ID not found in the database.
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
