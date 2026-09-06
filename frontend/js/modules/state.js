// state holds all the data that may be retrieved from data service layer.
export const state = {
  // Image Upload Section
  upload: {
    file: null,
    previewURL: null, // local browser preview via URL.createObjectURL()
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
    isPolling: false,
    pollingInterval: 1000,
    pollTimerID: null,

    // Network
    networkErrorCount: 0,
    maxNetworkRetries: 3,
    isReconnecting: false,
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

  // Stop polling.
  if (state.job.pollTimerID) {
    clearInterval(state.job.pollTimerID);
  }

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
  state.job.statusURL = "";
  state.job.error = null;
  state.job.isPolling = false;
  state.job.pollTimerID = null;
  state.job.networkErrorCount = 0;
  state.job.isReconnecting = false;

  // Reset Job Progress Steps
  Object.keys(state.job.progress).forEach((step) => {
    state.job.progress[step].status = "pending";
    state.job.progress[step].timestamp = null;
  });

  // Reset Results Section.
  state.results.image_variants = [];
  state.results.error = null;
}
