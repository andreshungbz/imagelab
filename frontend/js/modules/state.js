// ==================================================================================== //
// APPLICATION STATE
// ==================================================================================== //

// state is the single client-side source of truth for rendering and observation.
export const state = {
  // ----------------------------------------------------------------------------------
  // Image upload state.
  // ----------------------------------------------------------------------------------
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

  // ----------------------------------------------------------------------------------
  // Job observation state.
  // ----------------------------------------------------------------------------------
  job: {
    publicID: "",
    imageID: 0,
    status: "", // 'pending' | 'queued' | 'processing' | 'completed' | 'failed'
    stage: "starting",
    variantsCompleted: 0,
    statusURL: "",
    error: null,

    // Progress steps shown in the processing timeline.
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

    // Observation controls and lifecycle handles.
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

    // Transient network and reconnect feedback.
    networkErrorCount: 0,
    maxNetworkRetries: 3,
    isReconnecting: false,
    sseError: null,
  },

  // ----------------------------------------------------------------------------------
  // Generated variant state.
  // ----------------------------------------------------------------------------------
  results: {
    image_variants: [],
    isLoading: false,
    error: null,
  },
};

// ==================================================================================== //
// RESET LIFECYCLE
// ==================================================================================== //

// resetState clears the current upload, job, and result while preserving user settings.
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

  // Stop polling and abort any pending requests before replacing the state.
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
  // pollingMode and longPollWait are intentionally preserved across uploads.
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
