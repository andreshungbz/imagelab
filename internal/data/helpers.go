package data

import (
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/image/draw"
)

// cropCenterSquare extracts an exact square, cropped at the center if the source image is not square.
func cropCenterSquare(src image.Image, targetSize int) image.Image {
	// Get the source image's width and height.
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	// Choose the smaller dimension as the crop size.
	cropSize := min(srcW, srcH)

	// Calculate the centered coordinates for the crop square. Odd dimensions truncate when divided.
	startX := (srcW - cropSize) / 2
	startY := (srcH - cropSize) / 2
	cropRect := image.Rect(startX, startY, startX+cropSize, startY+cropSize)

	// Create the square destination image with the target size.
	dst := image.NewRGBA(image.Rect(0, 0, targetSize, targetSize))
	// Scale the crop square into the destination image.
	draw.BiLinear.Scale(dst, dst.Bounds(), src, cropRect, draw.Over, nil)

	return dst
}

// fitBounds resizes the image so it fits within given dimentions while preserving aspect ratio.
func fitBounds(src image.Image, maxW, maxH int) image.Image {
	// Get the source image's width and height.
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	// Calculate the scale ratios required to fit each dimension.
	ratioW := float64(maxW) / float64(srcW)
	ratioH := float64(maxH) / float64(srcH)

	// Choose the smaller ratio so both dimensions fit within the bounding box.
	ratio := min(ratioW, ratioH)

	// Avoid scaling up smaller images if the image already fits within the bounds.
	if ratio >= 1.0 {
		return src
	}

	// Calculate the scaled destination width and height.
	newW := int(float64(srcW) * ratio)
	newH := int(float64(srcH) * ratio)

	// Create the destination image with the new scaled dimensions.
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	// Scale the full source image into the destination image.
	draw.BiLinear.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	return dst
}

// saveImageToFile encodes and writes the image struct to disk as JPEG or PNG based on file extension.
func saveImageToFile(path string, img image.Image) error {
	// Create the destination file on disk at the specified path.
	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer out.Close()

	// Extract and normalize the file extension from the target path.
	ext := strings.ToLower(filepath.Ext(path))

	// Encode and save the image based on its target extension format.
	switch ext {
	case ".png":
		return png.Encode(out, img)
	case ".jpeg", ".jpg":
		return jpeg.Encode(out, img, &jpeg.Options{Quality: 100})
	default:
		return fmt.Errorf("unsupported target format: %s", ext)
	}
}
