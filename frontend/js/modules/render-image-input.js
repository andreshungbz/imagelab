import { state } from "./state.js";
import { formatMimeType, formatBytes, escapeHTML } from "./helpers.js";
import { icon } from "./icons.js";

// ==================================================================================== //
// IMAGE INPUT RENDERER
// ==================================================================================== //

// renderImageInput renders the upload form and either its dropzone or selected preview.
export function renderImageInput() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#image-input");
  if (!container) return;
  const { previewURL, metadata, isSubmitting, error } = state.upload;

  // A submitted upload or an existing job prevents a second submission.
  const isProcessDisabled =
    !previewURL || isSubmitting || Boolean(state.job.publicID);

  // Generate the complete section markup from the current upload state.
  const content = `
    <div class="section-header">
      <h3 id="upload-heading">${icon("upload")} Upload Image</h3>
    </div>
    <form id="upload-form" aria-busy="${isSubmitting}">
      <input type="file" id="file-input" name="image" accept="image/jpeg,image/png"
        aria-label="Choose Image" hidden ${isSubmitting ? "disabled" : ""} />
      ${
        // If a preview URL is available, show the image preview and metadata. Otherwise, show the dropzone.
        previewURL
          ? `
        <div class="preview-card">
          <div class="preview-image-wrapper">
            <img src="${escapeHTML(previewURL)}" alt="Selected image preview" class="img-preview" />
          </div>
          <div class="preview-details">
            <strong>${escapeHTML(metadata.originalName)}</strong>
            <div class="preview-metadata">
              <span>${formatBytes(metadata.sizeBytes)}</span>
              <span>${formatMimeType(metadata.mimeType)}</span>
              ${metadata.width && metadata.height ? `<span>${metadata.width} × ${metadata.height}</span>` : ""}
            </div>
            <button type="button" class="btn btn-secondary" data-action="choose-image" ${isSubmitting ? "disabled" : ""}>
              ${icon("image")} Choose Another Image
            </button>
          </div>
        </div>`
          : `
        <div id="dropzone" class="dropzone-area">
          <div class="dropzone-content">
            <div class="dropzone-icon">${icon("upload")}</div>
            <strong>Drag and Drop An Image Here</strong>
            <p>or Choose A File to Get Started</p>
            <div class="browse-action">
              <button type="button" class="btn btn-secondary" data-action="choose-image">
                ${icon("image")} Choose Image
              </button>
            </div>
            <small>JPEG or PNG · Maximum 10 MB</small>
          </div>
        </div>`
      }
      <div class="preview-actions">
        <button type="submit" id="btn-process-upload" class="btn btn-primary" ${isProcessDisabled ? "disabled" : ""}>
          ${icon("upload")} ${isSubmitting ? "Uploading…" : "Process Image"}
        </button>
      </div>
    </form>
    ${error ? `<div class="image-input-error" role="alert"><strong>Error:</strong> ${escapeHTML(error)}</div>` : ""}
  `;

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
