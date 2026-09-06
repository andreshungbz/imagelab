import { emitter } from "./event-emitter.js";

// handleFileSelected validates the selected file and creates an object URL for preview.
function handleFileSelected(file) {
  if (!file) return;

  // Validate particular image format.
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg"];
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    emitter.emit(
      "upload:validation_error",
      "Only JPEG and PNG images are supported.",
    );
    return;
  }

  // Validate maximum image size (10 MB).
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE_BYTES) {
    emitter.emit("upload:validation_error", "Image file size exceeds limit.");
    return;
  }

  // Create object URL for browser preview and update upload metadata state.
  const previewURL = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const metadata = {
      originalName: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      width: img.width,
      height: img.height,
    };

    emitter.emit("upload:selected", { file, previewURL, metadata });
  };

  // Validate image load.
  img.onerror = () => {
    URL.revokeObjectURL(previewURL);
    emitter.emit("upload:validation_error", "Failed to load image file.");
  };

  img.src = previewURL;
}

// setupHandlers sets up event listeners using event delegation.
export function setupHandlers() {
  // Get the necessary container elements.
  const imageInputSection = document.querySelector("#image-input");
  const jobStatusSection = document.querySelector("#job-status");
  if (!imageInputSection || !jobStatusSection) return;

  // IMAGE INPUT SECTION HANDLERS

  // Form Submission Handler
  imageInputSection.addEventListener("submit", (e) => {
    if (e.target.id === "upload-form") {
      e.preventDefault();
      emitter.emit("upload:process");
    }
  });

  // File Input Selection Handler
  imageInputSection.addEventListener("change", (e) => {
    if (e.target.id === "file-input" && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  // Drag & Drop Handlers
  imageInputSection.addEventListener("dragover", (e) => {
    const dropzone = e.target.closest("#dropzone");
    if (dropzone) {
      e.preventDefault(); // Prevent the browser from opening the file.
      dropzone.classList.add("drag-active");
    }
  });
  imageInputSection.addEventListener("dragleave", (e) => {
    const dropzone = e.target.closest("#dropzone");
    if (dropzone) {
      dropzone.classList.remove("drag-active");
    }
  });
  imageInputSection.addEventListener("drop", (e) => {
    const dropzone = e.target.closest("#dropzone");
    if (dropzone) {
      e.preventDefault();
      dropzone.classList.remove("drag-active");

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    }
  });

  // JOB STATUS SECTION HANDLERS

  // Manually Start Polling Button Handler
  jobStatusSection.addEventListener("click", (e) => {
    if (e.target.id === "btn-check-status") {
      emitter.emit("job:poll_start");
    }
  });
}
