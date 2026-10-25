// state holds all the necessary data for UI rendering and data retrieval.
export const state = {
  // Image Upload Section
  upload: {
    file: null,
    previewURL: null, // Local browser preview via URL.createObjectURL()
    metadata: {
      originalName: "",
      sizeBytes: 0,
      mimeType: "",
      width: 0,
      height: 0,
    },
    isSubmitting: false,
    error: null,
  },

  // Job Status Section
  job: {
    publicID: "",
    imageID: 0,
    status: "", // 'pending' | 'queued' | 'processing' | 'completed' | 'failed'
    stage: "starting",
    variantsCompleted: 0,
    statusURL: "",
    error: null,

    // Progress steps
    progress: {
      uploadAccepted: {
        status: "pending", // 'pending' | 'active' | 'completed' | 'failed'
        timestamp: null,
      },
      originalStored: {
        status: "pending",
        timestamp: null,
      },
      generatingVariants: {
        status: "pending",
        timestamp: null,
      },
      completed: {
        status: "pending",
        timestamp: null,
      },
    },

    // Polling
    pollingMode: "short", // 'short' | 'long' | 'sse'
    isPolling: false,
    abortController: null,
    eventSource: null,
    version: 0,
    simulatedProgress: 0,
    observationToken: 0,
    shortPollInterval: 1000,
    shortPollTimerID: null,
    longPollWait: 20,

    // Network
    networkErrorCount: 0,
    maxNetworkRetries: 3,
    isReconnecting: false,
    sseError: null,
  },

  // Results Section
  results: {
    image_variants: [],
    isLoading: false,
    error: null,
  },
};

// resetState reverts all state variables to their initial values.
export function resetState() {
  // Revoke local preview URL.
  if (state.upload.previewURL) {
    URL.revokeObjectURL(state.upload.previewURL);
  }

  // Revoke variant blob URLs.
  if (state.results.image_variants && state.results.image_variants.length > 0) {
    state.results.image_variants.forEach((variant) => {
      if (variant.localURL) {
        URL.revokeObjectURL(variant.localURL);
      }
    });
  }

  // Stop polling and abort any pending requests.
  if (state.job.shortPollTimerID) {
    clearInterval(state.job.shortPollTimerID);
  }
  if (state.job.abortController) {
    state.job.abortController.abort();
    state.job.abortController = null;
  }
  if (state.job.eventSource) {
    state.job.eventSource.close();
    state.job.eventSource = null;
  }

  // Invalidate any in-flight observation loops.
  state.job.observationToken += 1;

  // Reset Upload Section.
  state.upload.file = null;
  state.upload.previewURL = null;
  state.upload.metadata = {
    originalName: "",
    sizeBytes: 0,
    mimeType: "",
    width: 0,
    height: 0,
  };
  state.upload.isSubmitting = false;
  state.upload.error = null;

  // Reset Job Section.
  state.job.publicID = "";
  state.job.imageID = 0;
  state.job.status = "";
  state.job.stage = "starting";
  state.job.variantsCompleted = 0;
  state.job.statusURL = "";
  state.job.error = null;
  state.job.version = 0;
  state.job.simulatedProgress = 0;
  state.job.pollingMode = state.job.pollingMode; // Preserve user-selected polling mode.
  state.job.longPollWait = state.job.longPollWait; // Preserve user-selected long poll wait duration.
  state.job.isPolling = false;
  state.job.shortPollTimerID = null;
  state.job.eventSource = null;
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;
  state.job.sseError = null;

  // Reset Job Progress Steps.
  Object.keys(state.job.progress).forEach((step) => {
    state.job.progress[step].status = "pending";
    state.job.progress[step].timestamp = null;
  });

  // Reset Results Section.
  state.results.image_variants = [];
  state.results.error = null;
}
