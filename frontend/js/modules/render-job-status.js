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
    longPollWait,
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

  // Calculate variant progress.
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

  const isActivelyProcessing =
    status === "processing" || status === "queued" || state.upload.isSubmitting;

  const isButtonDisabled =
    (isPolling && !error) ||
    status === "queued" ||
    status === "completed" ||
    status === "failed";

  // Compute clean label for Job ID across uploading, failed, and ready states.
  const displayJobID = publicID
    ? escapeHTML(publicID)
    : isUploading
      ? "Assigning ID..."
      : state.upload.error || status === "failed" || hasFailedStep
        ? "Upload Failed"
        : "—";

  // Check if job status structure is already rendered in the DOM.
  const existingJobMeta = container.querySelector(".job-meta-card");
  const existingSelectMode = container.querySelector("#poll-mode-select");

  if (existingJobMeta && existingSelectMode && hasJob) {
    // 1. Update controls only if mode/wait changed externally.
    if (existingSelectMode.value !== pollingMode) {
      existingSelectMode.value = pollingMode;
    }

    const modeControlGroup = container.querySelector(".mode-control");
    let existingWaitSelect = container.querySelector("#wait-select");

    if (pollingMode === "long") {
      if (!existingWaitSelect) {
        const waitSelectHTML = `
          <label for="wait-select" class="sr-only">Wait Duration</label>
          <select id="wait-select" class="form-select-sm" aria-label="Select long poll wait duration">
            <option value="20" ${longPollWait === 20 ? "selected" : ""}>Wait 20s</option>
            <option value="10" ${longPollWait === 10 ? "selected" : ""}>Wait 10s</option>
            <option value="1" ${longPollWait === 1 ? "selected" : ""}>Wait 1s</option>
          </select>`;
        modeControlGroup.insertAdjacentHTML("afterbegin", waitSelectHTML);
      } else if (parseInt(existingWaitSelect.value, 10) !== longPollWait) {
        existingWaitSelect.value = String(longPollWait);
      }
    } else if (existingWaitSelect) {
      // Remove wait-select when switching back to short polling.
      const waitLabel = container.querySelector("label[for='wait-select']");
      if (waitLabel) waitLabel.remove();
      existingWaitSelect.remove();
    }

    // 2. Update Job ID in DOM if it changed from placeholder to active publicID.
    const jobIdEl = container.querySelector(".job-meta-card .meta-item strong");
    if (jobIdEl) {
      jobIdEl.textContent = displayJobID;
    }

    // 3. Update status badge.
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
    const badgeEl = container.querySelector(".job-meta-card .badge");
    if (badgeEl) {
      badgeEl.className = `badge badge-${statusClass}`;
      badgeEl.innerHTML = `${icon(statusClass === "completed" ? "check" : statusClass === "failed" ? "close" : "clock")} ${state.upload.isSubmitting ? "Uploading" : statusLabel}`;
    }

    // 4. Update Last Observed Version & Simulated Progress.
    const versionEl = container.querySelector(".job-meta-subrow strong");
    if (versionEl) {
      versionEl.textContent = escapeHTML(String(version || 0));
    }

    // 5. Update Variant Progress Bar & Percentage.
    const countEl = container.querySelector(".variant-progress-count");
    if (countEl) {
      countEl.textContent = `${completedVariantsCount} / ${targetVariantsTotal} variants (${calculatedPercentage}%)`;
    }
    const fillEl = container.querySelector(".variant-progress-fill");
    if (fillEl) {
      fillEl.style.width = `${calculatedPercentage}%`;
      fillEl.className = `variant-progress-fill ${isActivelyProcessing ? "is-animating" : ""}`;
    }

    // 6. Update Step Items.
    const steps = [
      ["uploadAccepted", "Upload Accepted"],
      ["originalStored", "Original Stored"],
      ["generatingVariants", "Generating Variants"],
      ["completed", "Complete"],
    ];

    const stepItems = container.querySelectorAll(".step-item");
    steps.forEach(([key, label], idx) => {
      const itemEl = stepItems[idx];
      if (!itemEl) return;
      const step = progress[key];
      const stepStatus = ["pending", "active", "completed", "failed"].includes(
        step.status,
      )
        ? step.status
        : "pending";

      itemEl.className = `step-item step-${stepStatus}`;
      const iconEl = itemEl.querySelector(".step-icon");
      if (iconEl) iconEl.innerHTML = getStepStatusIcon(stepStatus);

      const timeEl = itemEl.querySelector(".step-time");
      if (timeEl) {
        timeEl.textContent =
          step.timestamp ||
          (stepStatus === "pending"
            ? "Pending"
            : stepStatus === "active"
              ? "In progress"
              : stepStatus === "failed"
                ? "Failed"
                : "");
      }
    });

    // 7. Update Actions / Check Status Button & Error Text.
    let jobActionsContainer = container.querySelector(".job-actions");
    const jobProgressContainer = container.querySelector(".job-progress");

    if (publicID) {
      if (!jobActionsContainer && jobProgressContainer) {
        // Render actions container if it didn't exist yet
        const actionsHTML = `
          <div class="job-actions">
            <button type="button" id="btn-check-status" class="btn btn-secondary">
              ${icon("refresh")} Check Status
            </button>
            <p></p>
          </div>`;
        jobProgressContainer.insertAdjacentHTML("beforeend", actionsHTML);
        jobActionsContainer = container.querySelector(".job-actions");
      }

      if (jobActionsContainer) {
        const btnCheck = jobActionsContainer.querySelector("#btn-check-status");
        if (btnCheck) {
          btnCheck.disabled = isButtonDisabled;
          btnCheck.innerHTML = `${icon("refresh")} ${isPolling && !error ? "Checking..." : error ? "Try Again" : "Check Status"}`;
        }

        const hintText = jobActionsContainer.querySelector("p");
        if (hintText) {
          hintText.className = error ? "text-danger" : "";
          hintText.innerHTML = error
            ? escapeHTML(error)
            : isPolling
              ? `<button type="button" id="btn-cancel-polling" class="btn-link">Cancel</button>`
              : `Click to check status.`;
        }
      }
    } else if (jobActionsContainer) {
      jobActionsContainer.remove();
    }

    // 8. Network Reconnecting Indicator
    let warningEl = container.querySelector(".job-status-warning");
    if (isReconnecting && networkErrorCount < maxNetworkRetries) {
      if (!warningEl) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div class="job-status-warning">We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...</div>`,
        );
      } else {
        warningEl.textContent = `We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...`;
      }
    } else if (warningEl) {
      warningEl.remove();
    }

    return;
  }

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

  // Section header with observation mode select and conditional wait time select.
  let content = `
    <div class="section-header">
      <h3 id="job-heading">${icon("settings")} Processing Job</h3>
      <div class="mode-control">
        ${
          pollingMode === "long"
            ? `
          <label for="wait-select" class="sr-only">Wait Duration</label>
          <select id="wait-select" class="form-select-sm" aria-label="Select long poll wait duration">
            <option value="20" ${longPollWait === 20 ? "selected" : ""}>Wait 20s</option>
            <option value="10" ${longPollWait === 10 ? "selected" : ""}>Wait 10s</option>
            <option value="1" ${longPollWait === 1 ? "selected" : ""}>Wait 1s</option>
          </select>`
            : ""
        }
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

    content += `
      <div class="job-meta-card">
        <div class="meta-item">
          <span>Job ID</span>
          <strong>${displayJobID}</strong>
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
          <div class="variant-progress-fill ${isActivelyProcessing ? "is-animating" : ""}" 
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
