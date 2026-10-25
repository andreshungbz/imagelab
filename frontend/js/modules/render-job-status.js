import { state } from "./state.js";
import { escapeHTML, getStepStatusIcon } from "./helpers.js";
import { icon } from "./icons.js";

// renderJobStatus generates the HTML for the job status section and observation mode controls.
export function renderJobStatus() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#job-status");
  if (!container) return;

  const {
    publicID,
    status,
    progress,
    pollingMode,
    stage,
    variantsCompleted,
    longPollWait,
    version,
    simulatedProgress,
    isPolling,
    isReconnecting,
    networkErrorCount,
    maxNetworkRetries,
    sseError,
    error,
  } = state.job;

  // Determine different conditions based on the state variables.
  const hasFailedStep = Object.values(progress).some(
    (step) => step.status === "failed",
  );
  const isUploading = state.upload.isSubmitting && !state.upload.error;
  const hasJob =
    Boolean(publicID) || isUploading || status === "failed" || hasFailedStep;

  // Calculate variant progress based strictly on completed local variant blobs.
  const localVariantsCount = state.results.image_variants
    ? state.results.image_variants.filter((v) => Boolean(v.localURL)).length
    : 0;
  const completedVariantsCount =
    pollingMode === "sse" ? variantsCompleted : localVariantsCount;
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
  const existingObserverInput = container.querySelector("#observe-job-id");

  const observerInputState = existingObserverInput
    ? {
        value: existingObserverInput.value,
        focused: document.activeElement === existingObserverInput,
        selectionStart: existingObserverInput.selectionStart,
        selectionEnd: existingObserverInput.selectionEnd,
      }
    : null;

  const activeSelectId =
    document.activeElement &&
    (document.activeElement.id === "poll-mode-select" ||
      document.activeElement.id === "wait-select")
      ? document.activeElement.id
      : null;

  if (existingJobMeta && existingSelectMode && hasJob) {
    // 1. Update controls only if mode/wait changed externally.
    if (existingSelectMode.value !== pollingMode) {
      existingSelectMode.value = pollingMode;
    }

    const modeControlGroup = container.querySelector(".mode-control");
    let currentWaitSelect = container.querySelector("#wait-select");

    if (pollingMode === "long") {
      if (!currentWaitSelect) {
        const waitSelectHTML = `
          <label for="wait-select" class="sr-only">Wait Duration</label>
          <select id="wait-select" class="form-select-sm" aria-label="Select long poll wait duration">
            <option value="20" ${longPollWait === 20 ? "selected" : ""}>Wait 20s</option>
            <option value="10" ${longPollWait === 10 ? "selected" : ""}>Wait 10s</option>
            <option value="1" ${longPollWait === 1 ? "selected" : ""}>Wait 1s</option>
          </select>`;
        modeControlGroup.insertAdjacentHTML("afterbegin", waitSelectHTML);
      } else if (parseInt(currentWaitSelect.value, 10) !== longPollWait) {
        currentWaitSelect.value = String(longPollWait);
      }
    } else if (currentWaitSelect) {
      // Remove wait-select when switching back to short polling or SSE.
      const waitLabel = container.querySelector("label[for='wait-select']");
      if (waitLabel) waitLabel.remove();
      currentWaitSelect.remove();
    }

    // 2. Update Job ID and Copy Button in DOM dynamically.
    const jobIdEl = container.querySelector(".job-meta-card .meta-item strong");
    if (jobIdEl) {
      jobIdEl.textContent = displayJobID;
    }

    const jobIdLabel = container.querySelector(".job-id-label");
    let copyJobIDButton = container.querySelector("#btn-copy-job-id");

    if (publicID) {
      if (!copyJobIDButton && jobIdLabel) {
        jobIdLabel.insertAdjacentHTML(
          "beforeend",
          `<button type="button" id="btn-copy-job-id" class="btn btn-secondary btn-icon" aria-label="Copy job ID" title="Copy job ID">
            ${icon("copy")}
          </button>`,
        );
      }
    } else if (copyJobIDButton) {
      copyJobIDButton.remove();
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

    const metaItemsGroup = container.querySelector(".meta-items-group");
    const stageEl = container.querySelector("[data-stage]");
    if (stageEl) {
      const valueEl = stageEl.querySelector("strong");
      if (valueEl) valueEl.textContent = stage;
    }
    let simulatedEl = container.querySelector("[data-simulated-progress]");

    if (simulatedProgress > 0) {
      if (simulatedEl) {
        const valEl = simulatedEl.querySelector("strong");
        if (valEl) valEl.textContent = String(simulatedProgress);
      } else if (metaItemsGroup) {
        const simulatedProgressHTML = `
          <div class="meta-item" data-simulated-progress>
            <span>Simulated Progress</span>
            <strong>${simulatedProgress}</strong>
          </div>`;
        if (stageEl) {
          stageEl.insertAdjacentHTML("beforebegin", simulatedProgressHTML);
        } else {
          metaItemsGroup.insertAdjacentHTML("beforeend", simulatedProgressHTML);
        }
      }
    } else if (simulatedEl) {
      simulatedEl.remove();
    }

    // 5. Update Variant Progress Bar & Percentage based on local variants.
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
        // Render actions container if it didn't exist yet.
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
    if (sseError || (isReconnecting && networkErrorCount < maxNetworkRetries)) {
      const warningMessage =
        sseError ||
        `We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...`;
      if (!warningEl) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div class="job-status-warning">${escapeHTML(warningMessage)}</div>`,
        );
      } else {
        warningEl.textContent = warningMessage;
      }
    } else if (warningEl) {
      warningEl.remove();
    }

    // Preserve active select focus if dropdown was active
    if (activeSelectId) {
      const activeEl = container.querySelector(`#${activeSelectId}`);
      if (activeEl) activeEl.focus({ preventScroll: true });
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
          <option value="sse" ${pollingMode === "sse" ? "selected" : ""}>SSE</option>
        </select>
      </div>
    </div>`;

  // Existing-job observation control supports opening the same job in another tab.
  content += `
    <div class="job-observer-control">
      <label for="observe-job-id">Observe Existing Job</label>
      <div class="job-observer-input-group">
        <input id="observe-job-id" type="text" value="${escapeHTML(publicID)}" placeholder="Paste job ID" autocomplete="off" />
        <button type="button" id="btn-observe-job-id" class="btn btn-secondary">Observe</button>
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
          <div class="job-id-label">
            <span>Job ID</span>
            ${
              publicID
                ? `<button type="button" id="btn-copy-job-id" class="btn btn-secondary btn-icon" aria-label="Copy job ID" title="Copy job ID">
                    ${icon("copy")}
                  </button>`
                : ""
            }
          </div>
          <div class="job-id-value">
            <strong>${displayJobID}</strong>
          </div>
        </div>
        <span class="badge badge-${statusClass}">
          ${icon(statusClass === "completed" ? "check" : statusClass === "failed" ? "close" : "clock")}
          ${state.upload.isSubmitting ? "Uploading" : statusLabel}
        </span>
      </div>

      <div class="job-meta-subrow">
        <div class="meta-items-group">
          <div class="meta-item">
            <span>Job Version</span>
            <strong>${escapeHTML(String(version || 0))}</strong>
          </div>
          ${
            simulatedProgress > 0
              ? `
            <div class="meta-item" data-simulated-progress>
              <span>Simulated Progress</span>
              <strong>${simulatedProgress}</strong>
            </div>`
              : ""
          }
          <div class="meta-item" data-stage>
            <span>Stage</span>
            <strong>${escapeHTML(stage)}</strong>
          </div>
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
  if (sseError || (isReconnecting && networkErrorCount < maxNetworkRetries)) {
    const warningMessage =
      sseError ||
      `We're having connection issues. Retrying (${networkErrorCount}/${maxNetworkRetries})...`;
    content += `<div class="job-status-warning">${escapeHTML(warningMessage)}</div>`;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);

  if (observerInputState) {
    const observerInput = container.querySelector("#observe-job-id");
    if (observerInput) {
      observerInput.value = observerInputState.value;
      if (observerInputState.focused) {
        observerInput.focus({ preventScroll: true });
        observerInput.setSelectionRange(
          observerInputState.selectionStart,
          observerInputState.selectionEnd,
        );
      }
    }
  }

  if (activeSelectId) {
    const activeEl = container.querySelector(`#${activeSelectId}`);
    if (activeEl) activeEl.focus({ preventScroll: true });
  }
}
