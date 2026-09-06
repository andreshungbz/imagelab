import { state } from "./state.js";
import { formatMimeType, formatBytes, escapeHTML } from "./helpers.js";

// renderImageInput renders the image upload and dropzone section.
export function renderImageInput() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#image-input");
  if (!container) return;
  const { previewURL, metadata, isSubmitting, error } = state.upload;

  // Add initial content.
  let content = `
    <div class="section-header">
      <h3><span>☁️</span> Upload Image</h3>
    </div>
  `;

  // NO IMAGE UPLOADED BRANCH
  if (!previewURL) {
    content += `
      <form id="upload-form">
        <div id="dropzone" class="dropzone-area">
          <input
            type="file"
            id="file-input"
            name="image"
            accept="image/jpeg,image/png"
            style="display: none;"
          />
          <div class="dropzone-content">
            <div>☁️</div>
            <div><strong>Drag & Drop an Image Here</strong></div>
            <div class="text-muted">Or choose a file to get started.</div>

            <div class="browse-action">
              <label for="file-input" class="btn btn-secondary btn-browse-label">
                🖼️ Choose Image
              </label>
            </div>

            <div><small>Supports JPEG or PNG Images (Maximum 10MB File Size)</small></div>
          </div>
        </div>

        <div class="preview-actions">
          <button type="submit" id="btn-process-upload" class="btn btn-primary" disabled>
            ⬆️ Process Image
          </button>
        </div>
      </form>
    `;
  }
  // IMAGE UPLOADED BRANCH
  else {
    // Escape untrusted user filename.
    const safeOriginalName = escapeHTML(metadata.originalName);

    // Disable button if missing previewURL, currently submitting, or job already exists.
    const hasActiveJob = Boolean(state.job.publicID);
    const isProcessDisabled = !previewURL || isSubmitting || hasActiveJob;

    content += `
      <form id="upload-form">
        <input
          type="file"
          id="file-input"
          name="image"
          accept="image/jpeg,image/png"
          style="display: none;"
        />
        <div class="preview-card">
          <div class="preview-image-wrapper">
            <img src="${previewURL}" alt="Preview" class="img-preview" />
          </div>

          <div class="preview-details">
            <div><strong>${safeOriginalName}</strong></div>
            <div>
              <span>${formatMimeType(metadata.mimeType)}</span>
              <span>${formatBytes(metadata.sizeBytes)}</span>
              <span>${
                metadata.width && metadata.height
                  ? `${metadata.width}px x ${metadata.height}px`
                  : ""
              }</span>
            </div>

            <label for="file-input" class="btn btn-secondary ${isSubmitting ? "disabled" : ""}">
              Choose Another Image
            </label>
          </div>
        </div>

        <div class="preview-actions">
          <button type="submit" id="btn-process-upload" class="btn btn-primary" ${isProcessDisabled ? "disabled" : ""}>
            ⬆️ Process Image
          </button>
        </div>
      </form>
    `;
  }

  // Add error message if present.
  if (error) {
    // Escape untrusted error message.
    const safeError = escapeHTML(error);
    content += `
        <div class="image-input-error">
          <strong>Error:</strong> ${safeError}
        </div>
    `;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
