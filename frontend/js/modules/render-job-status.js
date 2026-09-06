import { state } from "./state.js";
import { escapeHTML, getStepStatusIcon } from "./helpers.js";

// renderJobStatus renders the job processing progress section.
export function renderJobStatus() {
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
