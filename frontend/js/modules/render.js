import { state } from "./state.js";

import {
  formatMimeType,
  formatBytes,
  escapeHTML,
  getStepStatusIcon,
} from "./helpers.js";

// renderImageInput renders the image upload and dropzone section.
function renderImageInput() {
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

// renderJobStatus renders the job processing progress section.
function renderJobStatus() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#job-status");
  if (!container) return;
  const { previewURL } = state.upload;
  const {
    publicID,
    status,
    progress,
    isPolling,
    isReconnecting,
    networkErrorCount,
    maxNetworkRetries,
    error,
  } = state.job;

  // Add initial content.
  let content = `
    <div class="section-header">
      <h3><span>⚙️</span> Job Status</h3>
    </div>
  `;

  // NO IMAGE SELECTED BRANCH
  if (!previewURL) {
    content += `
      <div class="job-status-empty text-muted">
        <div>📋</div>
        <div><strong>No Active Job</strong></div>
        <div class="text-muted">Upload an image to create a processing job.</div>
      </div>
    `;
  }
  // IMAGE SELECTED BRANCH
  else {
    const jobIDDisplay = publicID ? escapeHTML(publicID) : "<em>PENDING</em>";
    const statusDisplay = status ? escapeHTML(status.toUpperCase()) : "PENDING";

    content += `
      <div class="job-meta-card">
        <div class="meta-item">
          <strong>Job ID:</strong> <span>${jobIDDisplay}</span>
        </div>
        <div class="meta-item">
          <strong>State:</strong> <span class="badge badge-${escapeHTML(status)}">${statusDisplay}</span>
        </div>
      </div>

      <div class="job-steps-container">
        <ul class="job-steps-list">
          <li class="step-item">
            <span class="step-icon">${getStepStatusIcon(progress.uploadAccepted.status)}</span>
            <span class="step-label">Upload Accepted</span>
            <span class="step-time text-muted">${progress.uploadAccepted.timestamp || ""}</span>
          </li>
          <li class="step-item">
            <span class="step-icon">${getStepStatusIcon(progress.originalStored.status)}</span>
            <span class="step-label">Original Image Stored</span>
            <span class="step-time text-muted">${progress.originalStored.timestamp || ""}</span>
          </li>
          <li class="step-item">
            <span class="step-icon">${getStepStatusIcon(progress.generatingVariants.status)}</span>
            <span class="step-label">Generating Image Variants</span>
            <span class="step-time text-muted">${progress.generatingVariants.timestamp || ""}</span>
          </li>
          <li class="step-item">
            <span class="step-icon">${getStepStatusIcon(progress.completed.status)}</span>
            <span class="step-label">Job Finished</span>
            <span class="step-time text-muted">${progress.completed.timestamp || ""}</span>
          </li>
        </ul>
      </div>
    `;

    // Check Status Button (Always visible once job exists; disabled while polling)
    if (publicID) {
      const buttonText = isPolling ? "Polling..." : "Check Status";
      content += `
        <div class="job-actions">
          <button type="button" id="btn-check-status" class="btn btn-secondary" ${isPolling ? "disabled" : ""}>
            ${buttonText}
          </button>
        </div>
      `;
    }

    // Network Reconnecting Indicator
    if (isReconnecting && networkErrorCount < maxNetworkRetries) {
      content += `
        <div class="job-status-warning">
          <span>⚠️</span> Connection unstable. Retrying (${networkErrorCount}/${maxNetworkRetries})...
        </div>
      `;
    }

    // Job Level Error Display
    if (error) {
      const safeError = escapeHTML(error);
      content += `
        <div class="job-status-error">
          <strong>Error:</strong> ${safeError}
        </div>
      `;
    }
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}

// renderResults renders the image variants processed by the job.
function renderResults() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#results");
  if (!container) return;
  const { variants, error } = state.results;

  // Add initial content.
  let content = `
    <div class="section-header">
      <h3><span>🖼️</span> Generated Image Variants</h3>
    </div>
  `;

  // NO VARIANTS BRANCH
  if (!variants || variants.length === 0) {
    content += `
      <div>🖼️</div>
      <div><strong>No Images Generated Yet</strong></div>
      <div class="text-muted">Processed image variants will appear here.</div>
    `;
  }
  // VARIANTS AVAILABLE BRANCH
  else {
    // Iterate over variants and add to content.
    content += `<div class="results-grid">`;
    variants.forEach((variant) => {
      const safeLabel = escapeHTML(variant.label || "Variant");
      const displayUrl = variant.localURL || variant.url;
      const safeUrl = escapeHTML(displayUrl);
      const safeDownloadName = escapeHTML(variant.name || `${safeLabel}.png`);
      const safeMime = variant.mimeType ? formatMimeType(variant.mimeType) : "";
      const safeSize = variant.sizeBytes ? formatBytes(variant.sizeBytes) : "";
      const dimensions =
        variant.width && variant.height
          ? `${variant.width}px × ${variant.height}px`
          : "";

      content += `
        <div class="variant-card">
          <div class="variant-image-wrapper">
            <img src="${safeUrl}" alt="${safeLabel}" class="img-variant" />
          </div>
          <div class="variant-details">
            <div class="variant-title"><strong>${safeLabel}</strong></div>
            <div class="variant-meta text-muted">
              ${safeMime ? `<span>${safeMime}</span>` : ""}
              ${safeSize ? `<span>${safeSize}</span>` : ""}
              ${dimensions ? `<span>${dimensions}</span>` : ""}
            </div>
          </div>
          <div class="variant-actions">
            <a href="${safeUrl}" download="${safeDownloadName}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
              Download
            </a>
          </div>
        </div>
      `;
    });
    content += `</div>`;
  }

  // Results Level Error Display
  if (error) {
    const safeError = escapeHTML(error);
    content += `
      <div class="results-error">
        <strong>Error fetching results:</strong> ${safeError}
      </div>
    `;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}

// render calls the individual render functions to update the UI.
export function render() {
  renderImageInput();
  renderJobStatus();
  renderResults();
}
