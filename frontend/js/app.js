import { DataService } from "./modules/data-service.js";
import { emitter } from "./modules/event-emitter.js";
import { state, resetState } from "./modules/state.js";

import { render } from "./modules/render.js";
import { setupHandlers } from "./modules/handlers.js";

// ==================================================================================== #
// HELPER FUNCTIONS
// ==================================================================================== #

// stopPollingAndAbort stops the observation timer and aborts pending fetch requests.
function stopPollingAndAbort() {
  if (state.job.shortPollTimerID) {
    clearInterval(state.job.shortPollTimerID);
    state.job.shortPollTimerID = null;
  }
  if (state.job.abortController) {
    state.job.abortController.abort();
    state.job.abortController = null;
  }
  // UI-06: Invalidate callbacks from an observation stream after it is closed.
  if (state.job.eventSource) {
    state.job.eventSource.close();
    state.job.eventSource = null;
  }

  state.job.observationToken += 1;
  state.job.isPolling = false;
}

// resetNetworkState resets the job network tracking flags and errors.
function resetNetworkState() {
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;
  state.job.sseError = null;
  state.job.error = null;
  state.results.error = null;
}

// ==================================================================================== #
// IMAGE FILE SELECTION & VALIDATION EVENTS
// ==================================================================================== #

// upload:selected is triggered when user uploads a valid file.
emitter.on("upload:selected", ({ file, previewURL, metadata }) => {
  resetState();

  // Populate upload state.
  state.upload.file = file;
  state.upload.previewURL = previewURL;
  state.upload.metadata = metadata;

  // Set initial status text for display.
  state.job.status = "pending";

  // Step Progress: Upload Accepted --> completed
  state.job.progress.uploadAccepted.timestamp = new Date().toLocaleTimeString();
  state.job.progress.uploadAccepted.status = "completed";

  render();
});

// upload:validation_error is triggered when client-side validation fails (size, format).
emitter.on("upload:validation_error", (errorMessage) => {
  resetState();
  state.upload.error = errorMessage;

  // Step Progress: Upload Accepted --> failed
  state.job.progress.uploadAccepted.status = "failed";

  render();
});

// ==================================================================================== #
// IMAGE FILE UPLOAD & JOB INITIALIZATION EVENTS
// ==================================================================================== #

// upload:process is triggered when form submits and HTTP POST begins.
emitter.on("upload:process", () => {
  if (!state.upload.file) return;

  // Set submitting flag.
  state.upload.isSubmitting = true;

  // Step Progress: Original Stored --> active
  state.job.progress.originalStored.status = "active";

  render();
  DataService.uploadImage(state.upload.file);
});

// upload:success is triggered when the image upload succeeds and the server
// returns a 202 Accepted response with the process_image_variants job.
emitter.on("upload:success", (data) => {
  // Reset submitting flag.
  state.upload.isSubmitting = false;

  // Populate job state.
  state.job.publicID = data.job_id;
  state.job.imageID = data.image_id;
  state.job.status = data.status;
  state.job.statusURL = data.status_url;

  // Step Progress: Original Stored --> completed, Generating Variants --> active
  state.job.progress.originalStored.timestamp = new Date().toLocaleTimeString();
  state.job.progress.originalStored.status = "completed";
  state.job.progress.generatingVariants.status = "active";

  render();
  emitter.emit("job:observe_start");
});

// upload:error is triggered when the initial POST request to upload the image fails.
emitter.on("upload:error", (errorPayload) => {
  // Reset submitting flag.
  state.upload.isSubmitting = false;

  const isPayloadObject =
    typeof errorPayload === "object" && errorPayload !== null;
  const errorType = isPayloadObject ? errorPayload.type : "fetch_failed";
  const errorMessage = isPayloadObject ? errorPayload.message : errorPayload;

  if (errorType === "timeout") {
    // Show I/O timeout errors exclusively in the Processing Job section.
    state.upload.error = null;
    state.job.status = "failed";
    state.job.error = errorMessage;
    state.job.progress.originalStored.status = "failed";
  } else {
    // Show standard connection/fetch errors exclusively in the Upload Image input section.
    state.upload.error = errorMessage;
    state.job.status = "";
    state.job.error = null;
    state.job.progress.originalStored.status = "pending";
  }

  render();
});

// ==================================================================================== #
// JOB OBSERVATION & STEP PROGRESSION EVENTS
// ==================================================================================== #

// job:observe_start starts job status observation using the currently selected observation mode.
emitter.on("job:observe_start", () => {
  stopPollingAndAbort();
  resetNetworkState();

  // UI-04: Increment observation token to invalidate any previous/stale async calls.
  state.job.observationToken += 1;
  const token = state.job.observationToken;

  // Create AbortController instance for this observation session.
  state.job.abortController = new AbortController();
  const signal = state.job.abortController.signal;

  // Set active observation flag.
  state.job.isPolling = true;

  // UI-01: Dispatch observation for the accepted job without creating another upload.
  if (state.job.pollingMode === "sse") {
    state.job.eventSource = DataService.observeJobSSE(
      state.job.statusURL,
      token,
    );
    return;
  }

  // Dispatch initial polling request immediately.
  DataService.observeJob(state.job.statusURL, signal, token);

  // Short polling mode schedules recurring timer checks.
  if (state.job.pollingMode === "short") {
    state.job.shortPollTimerID = setInterval(() => {
      DataService.observeJob(state.job.statusURL, signal, token);
    }, state.job.shortPollInterval);
  }
});

// job:observe_existing starts observation for an already-created job without uploading a new image.
emitter.on("job:observe_existing", (publicID) => {
  stopPollingAndAbort();

  // Clear only observation and result state; preserve any unrelated upload selection.
  state.job.publicID = publicID;
  state.job.imageID = 0;
  state.job.status = "queued";
  state.job.stage = "starting";
  state.job.variantsCompleted = 0;
  state.job.statusURL = `/v1/jobs/${encodeURIComponent(publicID)}`;
  state.job.version = 0;
  state.job.simulatedProgress = 0;
  state.job.error = null;
  state.job.sseError = null;
  Object.values(state.job.progress).forEach((step) => {
    step.status = "pending";
    step.timestamp = null;
  });
  state.job.progress.uploadAccepted.status = "completed";
  state.job.progress.originalStored.status = "completed";
  state.job.progress.generatingVariants.status = "active";
  state.job.progress.completed.status = "pending";

  state.results.image_variants.forEach((variant) => {
    if (variant.localURL) URL.revokeObjectURL(variant.localURL);
  });
  state.results.image_variants = [];
  state.results.error = null;

  render();
  emitter.emit("job:observe_start");
});

// job:observe_stop is triggered when user cancels status checking.
emitter.on("job:observe_stop", () => {
  stopPollingAndAbort();
  render();
});

// job:mode_change toggles between short polling and long polling (U1-01).
emitter.on("job:mode_change", (newMode) => {
  if (state.job.pollingMode === newMode) return;
  state.job.pollingMode = newMode;

  // If job observation is active, restart observation in the new mode without re-submitting an image.
  if (
    state.job.publicID &&
    ["pending", "queued", "processing"].includes(state.job.status)
  ) {
    emitter.emit("job:observe_start");
  } else {
    render();
  }
});

// job:wait_change updates the long polling wait query parameter duration.
emitter.on("job:wait_change", (newWait) => {
  if (state.job.longPollWait === newWait) return;
  state.job.longPollWait = newWait;

  // Restart active observation if long polling is currently active to apply the new wait threshold.
  if (
    state.job.pollingMode === "long" &&
    state.job.publicID &&
    ["pending", "queued", "processing"].includes(state.job.status)
  ) {
    emitter.emit("job:observe_start");
  } else {
    render();
  }
});

// job:sse_open clears a temporary SSE reconnecting message after the stream opens or reconnects.
emitter.on("job:sse_open", () => {
  state.job.sseError = null;
  state.job.isReconnecting = false;
  state.job.error = null;
  render();
});

// job:sse_error reports a connection issue without changing the server job status.
emitter.on("job:sse_error", (errorMessage) => {
  state.job.sseError = errorMessage;
  state.job.isReconnecting = true;
  state.job.error = errorMessage;
  render();
});

// job:updated is triggered when the backend emits a version or progress update.
emitter.on("job:updated", (jobData) => {
  resetNetworkState();

  // Save latest version snapshot and simulation progress step (UI-02: Saving initial snapshot).
  if (typeof jobData.version === "number") {
    state.job.version = jobData.version;
  }
  if (typeof jobData.simulated_progress === "number") {
    state.job.simulatedProgress = jobData.simulated_progress;
  }
  if (typeof jobData.stage === "string") {
    state.job.stage = jobData.stage;
  }
  if (typeof jobData.variants_completed === "number") {
    state.job.variantsCompleted = jobData.variants_completed;
  }

  state.job.status = jobData.status;

  // UI-03: Process variant progress from every observation mode as snapshots arrive.
  const incomingVariants = jobData.result || jobData.variants;
  if (Array.isArray(incomingVariants) && incomingVariants.length > 0) {
    incomingVariants.forEach((incoming) => {
      const existing = state.results.image_variants.find(
        (v) => v.name === incoming.name,
      );

      if (!existing) {
        // New variant completed: store entry and trigger binary blob fetch.
        state.results.image_variants.push({ ...incoming });
        DataService.fetchSingleVariantBlob(incoming);
      } else if (!existing.localURL) {
        // Existing variant missing blob: trigger binary blob fetch.
        DataService.fetchSingleVariantBlob(incoming);
      }
    });
  }

  render();
});

// job:completed is triggered when the job reaches a terminal completed state.
emitter.on("job:completed", (jobData) => {
  stopPollingAndAbort();
  resetNetworkState();

  if (typeof jobData.version === "number") {
    state.job.version = jobData.version;
  }
  if (typeof jobData.simulated_progress === "number") {
    state.job.simulatedProgress = jobData.simulated_progress;
  }
  if (typeof jobData.stage === "string") {
    state.job.stage = jobData.stage;
  }
  if (typeof jobData.variants_completed === "number") {
    state.job.variantsCompleted = jobData.variants_completed;
  }

  // Step Progress: Generating Variants --> completed, Completed --> completed
  const now = new Date().toLocaleTimeString();
  state.job.progress.generatingVariants.status = "completed";
  state.job.progress.generatingVariants.timestamp = now;
  state.job.progress.completed.status = "completed";
  state.job.progress.completed.timestamp = now;
  state.job.status = "completed";

  render();

  // Hydrate any remaining un-fetched variant binary blobs.
  const variants = jobData.result || jobData.variants;
  if (Array.isArray(variants) && variants.length > 0) {
    DataService.fetchVariantBlobs(variants);
  }
});

// job:failed is triggered when the job reaches a terminal failed state on the server.
emitter.on("job:failed", (jobData) => {
  stopPollingAndAbort();

  if (typeof jobData?.version === "number") {
    state.job.version = jobData.version;
  }
  if (typeof jobData?.simulated_progress === "number") {
    state.job.simulatedProgress = jobData.simulated_progress;
  }
  if (typeof jobData.stage === "string") {
    state.job.stage = jobData.stage;
  }
  if (typeof jobData.variants_completed === "number") {
    state.job.variantsCompleted = jobData.variants_completed;
  }

  // Populate job state with failure details.
  state.job.status = "failed";
  state.job.error =
    "The server failed to process your image. Please upload another image and try again.";

  // Step Progress: Generating Variants --> failed
  state.job.progress.generatingVariants.status = "failed";

  render();

  // Hydrate any remaining un-fetched variant binary blobs.
  const variants = jobData.result || jobData.variants;
  if (Array.isArray(variants) && variants.length > 0) {
    DataService.fetchVariantBlobs(variants);
  }
});

// job:network_error is triggered when observation encounters network or HTTP retrieval errors (UI-05).
emitter.on("job:network_error", (errorMessage) => {
  state.results.error = null; // Clear collateral variant errors.

  if (state.job.pollingMode === "short") {
    // Short polling uses transient retry counter.
    state.job.networkErrorCount += 1;
    state.job.isReconnecting = true;

    if (state.job.networkErrorCount >= state.job.maxNetworkRetries) {
      stopPollingAndAbort();
      state.job.error = errorMessage;
    }
  } else {
    // Long polling halts immediately on network error to avoid server loops.
    stopPollingAndAbort();
    state.job.error = errorMessage;
  }

  render();
});

// ==================================================================================== #
// IMAGE VARIANTS RESULTS EVENTS
// ==================================================================================== #

// variant:single_fetched is triggered when an individual variant blob finishes loading.
emitter.on("variant:single_fetched", ({ name, localURL }) => {
  const variant = state.results.image_variants.find((v) => v.name === name);
  if (variant) {
    variant.localURL = localURL;
    render();
  }
});

// variants:fetched is triggered when binary image blobs are loaded and converted to local ObjectURLs.
emitter.on("variants:fetched", (variantsWithBlobs) => {
  state.results.error = null;
  state.results.image_variants = variantsWithBlobs;
  render();
});

// variants:error is triggered when variants fetching binary image data fails.
emitter.on("variants:error", (errorMessage) => {
  state.results.error = errorMessage;
  render();
});

// ==================================================================================== #
// PAGE LIFECYCLE & APP INITIALIZATION
// ==================================================================================== #

// Abort active observation when the page unloads or navigates away.
window.addEventListener("beforeunload", () => {
  stopPollingAndAbort();
});

setupHandlers();
render();
