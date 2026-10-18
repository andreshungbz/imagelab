import { state } from "./state.js";
import { escapeHTML, getStepStatusIcon } from "./helpers.js";
import { icon } from "./icons.js";

// renderJobStatus generates the HTML for the job status section supporting Short/Long polling controls.
export function renderJobStatus() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#job-status");
  if (!container) return;
  const {
    publicID,
    status,
    progress,
    pollingMode,
    version,
    simulatedProgress,
    isPolling,
    isReconnecting,
    networkErrorCount,
    maxNetworkRetries,
    error,
  } = state.job;

  // Determine different conditions based on the state variables.
  const hasFailedStep = Object.values(progress).some(
    (step) => step.status === "failed",
  );
  const isUploading = state.upload.isSubmitting && !state.upload.error;
  const hasJob =
    Boolean(publicID) || isUploading || status === "failed" || hasFailedStep;

  // Create the status label.
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

  // Section header with observation mode select.
  let content = `
    <div class="section-header">
      <h3 id="job-heading">${icon("settings")} Processing Job</h3>
      <div class="mode-control">
        <label for="poll-mode-select" class="sr-only">Observation Mode</label>
        <select id="poll-mode-select" class="form-select-sm" aria-label="Select observation mode">
          <option value="short" ${pollingMode === "short" ? "selected" : ""}>Short Polling</option>
          <option value="long" ${pollingMode === "long" ? "selected" : ""}>Long Polling</option>
        </select>
      </div>
    </div>`;

  // If there is no active job, display an empty state message.
  if (!hasJob) {
    content += `
      <div class="empty-state job-status-empty">
        <div class="empty-icon">${icon("job")}</div>
        <strong>No Active Job</strong>
        <p>${state.upload.previewURL ? "Your image is ready. Select 'Process Image' to begin." : "Upload an image to create a processing job."}</p>
      </div>`;
  } else {
    // Otherwise, display the job details and progress.
    const steps = [
      ["uploadAccepted", "Upload Accepted"],
      ["originalStored", "Original Stored"],
      ["generatingVariants", "Generating Variants"],
      ["completed", "Complete"],
    ];

    // Dynamically calculate variant progress using total variants count.
    const completedVariantsCount = state.results.image_variants
      ? state.results.image_variants.length
      : 0;
    const targetVariantsTotal =
      state.results.targetTotal || Math.max(completedVariantsCount, 3);
    const calculatedPercentage =
      status === "completed"
        ? 100
        : Math.min(
            100,
            Math.round((completedVariantsCount / targetVariantsTotal) * 100),
          );

    // Determine if animated pulse shimmer should be active.
    const isActivelyProcessing =
      status === "processing" ||
      status === "queued" ||
      state.upload.isSubmitting;

    // Check Status acts as "Try Again" when an error is present.
    // Disable ONLY while actively polling without errors, queuing, or in terminal states.
    const isButtonDisabled =
      (isPolling && !error) ||
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

      <div class="job-meta-subrow">
        <div class="meta-items-group">
          <div class="meta-item">
            <span>Last Observed Version</span>
            <strong>${escapeHTML(String(version || 0))}</strong>
          </div>
          ${
            simulatedProgress > 0
              ? `
            <div class="meta-item">
              <span>Simulated Progress</span>
              <strong>${simulatedProgress}</strong>
            </div>`
              : ""
          }
        </div>
      </div>

      <div class="variant-progress-container">
        <div class="variant-progress-header">
          <span>Variant Generation Progress</span>
          <span class="variant-progress-count">${completedVariantsCount} / ${targetVariantsTotal} variants (${calculatedPercentage}%)</span>
        </div>
        <div class="variant-progress-bar" role="progressbar" aria-valuenow="${calculatedPercentage}" aria-valuemin="0" aria-valuemax="100">
          <div className="variant-progress-fill ${isActivelyProcessing ? "is-animating" : ""}"
            class="variant-progress-fill ${isActivelyProcessing ? "is-animating" : ""}" 
            style="width: ${calculatedPercentage}%">
          </div>
        </div>
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
              </li>`;
            })
            .join("")}
        </ol>
        ${
          // If a publicID exists, show the "Check Status" button. Otherwise, don't show it.
          publicID
            ? `
          <div class="job-actions">
            <button type="button" id="btn-check-status" class="btn btn-secondary"
              ${isButtonDisabled ? "disabled" : ""}>
              ${icon("refresh")} ${isPolling && !error ? "Checking..." : error ? "Try Again" : "Check Status"}
            </button>
            <p class="${error ? "text-danger" : ""}">
              ${
                error
                  ? escapeHTML(error)
                  : isPolling
                    ? `<button type="button" id="btn-cancel-polling" class="btn-link">Cancel</button>`
                    : `Click to check status.`
              }
            </p>
          </div>`
            : ""
        }
      </div>`;
  }

  // Network Reconnecting Indicator
  if (isReconnecting && networkErrorCount < maxNetworkRetries) {
    content += `<div class="job-status-warning">We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...</div>`;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
