import { state } from "./state.js";
import { escapeHTML, getStepStatusIcon } from "./helpers.js";
import { icon } from "./icons.js";

// renderJobStatus generates the HTML for the job status section.
export function renderJobStatus() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#job-status");
  if (!container) return;
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

  // Determine if there is an active job or a failed step attempt.
  // Ignore state.upload.isSubmitting if an upload error exists to prevent visual layout flicker on offline fetch errors.
  const hasFailedStep = Object.values(progress).some(
    (step) => step.status === "failed",
  );
  const isUploading = state.upload.isSubmitting && !state.upload.error;
  const hasJob =
    Boolean(publicID) || isUploading || status === "failed" || hasFailedStep;

  const knownStatuses = [
    "pending",
    "queued",
    "processing",
    "completed",
    "failed",
  ];
  const statusClass = knownStatuses.includes(status) ? status : "pending";
  const statusLabel =
    statusClass.charAt(0).toUpperCase() + statusClass.slice(1);

  // Start building the content for the job status section.
  let content = `
    <div class="section-header">
      <h3 id="job-heading">${icon("settings")} Processing Job</h3>
    </div>
  `;

  // If there is no active job, display an empty state message.
  if (!hasJob) {
    content += `
      <div class="empty-state job-status-empty">
        <div class="empty-icon">${icon("job")}</div>
        <strong>No Active Job</strong>
        <p>${state.upload.previewURL ? "Your image is ready. Select 'Process Image' to begin." : "Upload an image to create a processing job."}</p>
      </div>
    `;
    // Otherwise, display the job details and progress.
  } else {
    const steps = [
      ["uploadAccepted", "Upload Accepted"],
      ["originalStored", "Original Stored"],
      ["generatingVariants", "Generating Variants"],
      ["completed", "Complete"],
    ];

    // Disable the Check Status button while polling, queuing, processing, or after terminal states.
    const isButtonDisabled =
      isPolling ||
      status === "queued" ||
      status === "completed" ||
      status === "failed";

    content += `
      <div class="job-meta-card">
        <div class="meta-item">
          <span>Job ID</span>
          <strong>${publicID ? escapeHTML(publicID) : "Upload Failed"}</strong>
        </div>
        <span class="badge badge-${statusClass}">
          ${icon(statusClass === "completed" ? "check" : statusClass === "failed" ? "close" : "clock")}
          ${state.upload.isSubmitting ? "Uploading" : statusLabel}
        </span>
      </div>
      <div class="job-progress">
        <ol class="job-steps-list">
          ${steps
            .map(([key, label]) => {
              const step = progress[key];
              const stepStatus = [
                "pending",
                "active",
                "completed",
                "failed",
              ].includes(step.status)
                ? step.status
                : "pending";
              const time =
                step.timestamp ||
                (stepStatus === "pending"
                  ? "Pending"
                  : stepStatus === "active"
                    ? "In progress"
                    : stepStatus === "failed"
                      ? "Failed"
                      : "");
              return `
              <li class="step-item step-${stepStatus}" ${stepStatus === "active" ? 'aria-current="step"' : ""}>
                <span class="step-icon" aria-hidden="true">${getStepStatusIcon(stepStatus)}</span>
                <span class="step-label">${label}<span class="sr-only">: ${stepStatus}</span></span>
                <span class="step-time text-muted">${escapeHTML(time)}</span>
              </li>
            `;
            })
            .join("")}
        </ol>
        ${
          // If a publicID exists, show the "Check status" button; otherwise, don't show it.
          publicID
            ? `
          <div class="job-actions">
            <button type="button" id="btn-check-status" class="btn btn-secondary"
              ${isButtonDisabled ? "disabled" : ""}>
              ${icon("refresh")} ${isPolling ? "Checking..." : "Check Status"}
            </button>
            <p>
              ${
                isPolling
                  ? `Status updates automatically. <button type="button" id="btn-cancel-polling" class="btn-link">Cancel</button>`
                  : "Check for the latest job status."
              }
            </p>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  // Network Reconnecting Indicator
  if (isReconnecting && networkErrorCount < maxNetworkRetries) {
    content += `<div class="job-status-warning">We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...</div>`;
  }

  // Job Level Error Display
  if (error) {
    content += `<div class="job-status-error" role="alert"><strong>Error:</strong> ${escapeHTML(error)}</div>`;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
