import { DataService } from "./modules/data-service.js";
import { emitter } from "./modules/event-emitter.js";
import { state, resetState } from "./modules/state.js";

import { render } from "./modules/render.js";
import { setupHandlers } from "./modules/handlers.js";

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

  // Step Progress: Upload Accepted --> completed
  state.job.progress.uploadAccepted.status = "completed";
  state.job.progress.uploadAccepted.timestamp = new Date().toLocaleTimeString();

  render();
});

// upload:validation_error is triggered when client-side validation fails (size, format).
emitter.on("upload:validation_error", (errorMessage) => {
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

  // Set uploading flag.
  state.upload.isUploading = true;

  // Step Progress: Original Stored --> active
  state.job.progress.originalStored.status = "active";

  render();
  DataService.uploadImage(state.upload.file);
});

// upload:success is triggered when the image upload succeeds and the server
// returns a 202 Accepted response with the process_image_variants job.
emitter.on("upload:success", (data) => {
  // Reset uploading flag.
  state.upload.isUploading = false;

  // Populate job state.
  state.job.publicID = data.public_id;
  state.job.imageID = data.image_id;
  state.job.status = data.status || "queued";

  // Step Progress: Original Stored --> completed, Generating Variants --> active
  state.job.progress.originalStored.status = "completed";
  state.job.progress.originalStored.timestamp = new Date().toLocaleTimeString();
  state.job.progress.generatingVariants.status = "active";

  // Set loading flag.
  state.results.isLoading = true;

  render();
  emitter.emit("job:poll_start");
});

// upload:error is triggered when the initial POST request to upload the image fails.
emitter.on("upload:error", (errorMessage) => {
  state.upload.error = errorMessage;

  // Reset uploading flag.
  state.upload.isUploading = false;

  // Step Progress: Original Stored --> failed
  state.job.progress.originalStored.status = "failed";

  render();
});

// ==================================================================================== #
// JOB POLLING & STEP PROGRESSION EVENTS
// ==================================================================================== #

// job:poll_start is triggered after the 202 Accepted was received for a job.
emitter.on("job:poll_start", () => {
  if (state.job.pollTimerID) {
    clearInterval(state.job.pollTimerID);
  }
  state.job.isPolling = true;

  // Reset job network flags.
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;
  state.job.error = null;

  // Trigger immediate initial check before setting up interval.
  DataService.pollJobStatus(state.job.publicID);

  // Periodically check for job status updates on the server.
  state.job.pollTimerID = setInterval(() => {
    DataService.pollJobStatus(state.job.publicID);
  }, state.job.pollingInterval);
});

// job:updated is triggered when the job moves from queued to processing status.
emitter.on("job:updated", (jobData) => {
  state.job.status = jobData.status;

  // Reset job network state.
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;
  state.job.error = null;

  render();
});

// job:completed is triggered when the job has successfully completed.
emitter.on("job:completed", (jobData) => {
  // Stop polling inetrval.
  clearInterval(state.job.pollTimerID);
  state.job.isPolling = false;
  state.job.pollTimerID = null;

  // Reset job network state.
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;
  state.job.error = null;

  // Step Progress: Generating Variants --> completed, Completed --> completed
  const now = new Date().toLocaleTimeString();
  state.job.progress.generatingVariants.status = "completed";
  state.job.progress.generatingVariants.timestamp = now;
  state.job.progress.completed.status = "completed";
  state.job.progress.completed.timestamp = now;
  state.job.status = "completed";

  // Set loading flag.
  state.results.isLoading = true;

  render();

  // Fetch binary blob data for all variants returned in job results.
  if (jobData.variants && jobData.variants.length > 0) {
    DataService.fetchVariantBlobs(jobData.variants);
  } else {
    state.results.isLoading = false;
    render();
  }
});

// job:failed is triggered when the job fails on the server.
emitter.on("job:failed", (errorMessage) => {
  // Stop polling inetrval.
  clearInterval(state.job.pollTimerID);
  state.job.isPolling = false;
  state.job.pollTimerID = null;

  // Populate job state with failure details.
  state.job.status = "failed";
  state.job.error = errorMessage;

  // Step Progress: Generating Variants --> failed
  state.job.progress.generatingVariants.status = "failed";

  // Reset loading flag.
  state.results.isLoading = false;

  render();
});

// job:network_error is triggered when polling fails due to network issues.
emitter.on("job:network_error", (message) => {
  // Increment network error count and set reconnecting flag.
  state.job.networkErrorCount += 1;
  state.job.isReconnecting = true;

  // Halt polling and notify user only after exceeding maximum network retries.
  if (state.job.networkErrorCount >= state.job.maxNetworkRetries) {
    clearInterval(state.job.pollTimerID);
    state.job.isPolling = false;
    state.job.pollTimerID = null;
    state.job.error = "Connection lost. Click 'Check Status' to retry.";
  }

  render();
});

// ==================================================================================== #
// IMAGE VARIANTS RESULTS EVENTS
// ==================================================================================== #

// variants:fetched is triggered when binary image blobs are loaded and converted to local ObjectURLs.
emitter.on("variants:fetched", (variantsWithBlobs) => {
  state.results.isLoading = false;
  state.results.error = null;
  state.results.image_variants = variantsWithBlobs;
  render();
});

// variants:error is triggered when variants fetching binary image data fails.
emitter.on("variants:error", (errorMessage) => {
  state.results.isLoading = false;
  state.results.error = errorMessage;
  render();
});

// ==================================================================================== #
// APP INITIALIZATION
// ==================================================================================== #

setupHandlers();
render();
