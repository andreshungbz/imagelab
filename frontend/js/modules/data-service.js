import { emitter } from "./event-emitter.js";
import { state } from "./state.js";
import { getBelizeISOString } from "./helpers.js";

// Dynamically resolve the API host and base URL based on the current location.
const API_HOST = window.location.hostname;
const API_BASE = `http://${API_HOST}:4000`;

// DataService is the layer that interacts with the server API to interact with the database.
export const DataService = {
  // uploadImage sends the image file to the server API.
  async uploadImage(file) {
    try {
      // Prepare image data and send POST request.
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/v1/images`, {
        method: "POST",
        body: formData,
      });

      // Check for HTTP response errors.
      if (!res.ok) {
        let errorMessage = `Server returned an error (${res.status}). Please try again.`;
        try {
          const errorData = await res.json();
          errorMessage =
            errorData?.error?.image || errorData?.error || errorMessage;
        } catch {
          // Body was non-JSON or empty; retain status code message.
        }
        throw new Error(errorMessage);
      }

      // Parse JSON response.
      const data = await res.json();
      emitter.emit("upload:success", data);
    } catch (err) {
      // Handle various error types.
      const rawMsg = err.message || "";
      const isTimeoutError =
        err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        rawMsg.toLowerCase().includes("tcp") ||
        rawMsg.toLowerCase().includes("timeout");

      // Differentiate between an explicit I/O timeout and a generic server/connection offline error.
      if (isTimeoutError) {
        emitter.emit("upload:error", {
          type: "timeout",
          message:
            "Connection timed out while uploading to the server. Please check your internet connection speed and try again.",
        });
      } else {
        const userMessage =
          err instanceof TypeError
            ? "Unable to connect to the server. The server may be down. Please try again later."
            : rawMsg;

        emitter.emit("upload:error", {
          type: "fetch_failed",
          message: userMessage,
        });
      }
    }
  },

  // observeJob conducts job status updates using either short polling or long polling.
  async observeJob(statusURL, signal, token) {
    if (token !== state.job.observationToken) return; // UI-04

    // Construct the target URL according to the active observation mode.
    let targetURL = `${API_BASE}${statusURL}`;
    if (state.job.pollingMode === "long") {
      const version = state.job.version || 0;
      const waitTime = state.job.longPollWait || 20;
      targetURL += `?after=${version}&wait=${waitTime}`;
    }

    // WAIT-03: Create a 30-second request timeout signal and combine it with the session cancel.
    const timeoutSignal = AbortSignal.timeout(30000);
    const fetchSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    try {
      const res = await fetch(targetURL, { signal: fetchSignal });
      if (token !== state.job.observationToken) return; // UI-04

      // UI-03: Immediately send another long poll without parsing JSON if HTTP 204 No Content is received.
      if (res.status === 204) {
        if (state.job.pollingMode === "long" && state.job.isPolling) {
          this.observeJob(statusURL, signal, token);
        }
        return;
      }

      // Check non-success HTTP response status (e.g., 400 Bad Request or 500 Server Error).
      if (!res.ok) {
        throw new Error(`Server returned status code ${res.status}`);
      }

      // Parse incoming JSON payload.
      const data = await res.json();
      if (token !== state.job.observationToken) return; // UI-04

      switch (data.status) {
        case "completed":
          console.log({
            id: data.id,
            status: data.status,
            browser_receipt_time: getBelizeISOString(),
          });
          emitter.emit("job:completed", data);
          break;
        case "failed":
          console.log({
            id: data.id,
            status: data.status,
            browser_receipt_time: getBelizeISOString(),
          });
          emitter.emit("job:failed", data);
          break;
        case "queued":
        case "processing":
        default:
          // Emit job update event on version change, status change, or progress tick.
          emitter.emit("job:updated", data);

          // UI-03: Automatically issue the next long poll immediately upon receiving an active 200 OK.
          if (state.job.pollingMode === "long" && state.job.isPolling) {
            this.observeJob(statusURL, signal, token);
          }
          break;
      }
    } catch (err) {
      // Ignore DOMException errors caused by intentional abort calls.
      if (err.name === "AbortError") return;
      if (token !== state.job.observationToken) return; // UI-04

      // UI-05: Prompt for try again, keeping the current state.
      emitter.emit(
        "job:network_error",
        "Unable to check status. Click 'Try Again' to retry.",
      );
    }
  },

  // fetchSingleVariantBlob downloads binary image data for a single newly generated variant.
  async fetchSingleVariantBlob(variant) {
    try {
      const res = await fetch(`${API_BASE}${variant.url}`);
      if (!res.ok) {
        throw new Error(`Failed to load image variant: ${variant.name}`);
      }
      const blob = await res.blob();
      const localURL = URL.createObjectURL(blob);

      emitter.emit("variant:single_fetched", {
        name: variant.name,
        localURL,
      });
    } catch (err) {
      emitter.emit("variants:error", err.message);
    }
  },

  // fetchVariantBlobs downloads binary image data for all unhydrated variants from the server.
  async fetchVariantBlobs(variants) {
    try {
      // Concurrently fetch each variant's binary data and create local ObjectURLs.
      const variantsWithBlobs = await Promise.all(
        variants.map(async (variant) => {
          // If blob was already fetched incrementally, preserve existing ObjectURL.
          if (variant.localURL) return variant;

          const res = await fetch(`${API_BASE}${variant.url}`);
          if (!res.ok) {
            throw new Error(`Failed to load image variant: ${variant.name}`);
          }
          const blob = await res.blob();
          const localURL = URL.createObjectURL(blob);

          return {
            ...variant,
            localURL,
          };
        }),
      );

      emitter.emit("variants:fetched", variantsWithBlobs);
    } catch (err) {
      emitter.emit("variants:error", err.message);
    }
  },
};
