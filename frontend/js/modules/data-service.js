import { emitter } from "./event-emitter.js";
import { state } from "./state.js";

// Dynamically resolve the API host and base URL based on the current location.
const API_HOST = window.location.hostname;
const API_BASE = `http://${API_HOST}:4000`;

// DataService is the layer that interacts with the server API to interact with the database.
export const DataService = {
  // uploadImage sends the image file to the server API
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
      // Handle network failures, socket disconnects, and TCP timeout errors cleanly.
      const rawMsg = err.message || "";
      const isTimeout =
        rawMsg.toLowerCase().includes("tcp") ||
        rawMsg.toLowerCase().includes("timeout") ||
        err instanceof TypeError;

      const userMessage = isTimeout
        ? "Connection timed out while uploading to the server. Please check your internet connection speed and try again."
        : rawMsg;

      emitter.emit("upload:error", userMessage);
    }
  },

  // pollJobStatus polls the server for status updates on a processing job.
  async pollJobStatus(statusURL) {
    try {
      const res = await fetch(`${API_BASE}${statusURL}`);
      const data = await res.json();
      switch (data.status) {
        case "completed":
          emitter.emit("job:completed", data);
          break;
        case "failed":
          emitter.emit(
            "job:failed",
            data.error ||
              "The server failed to process your image. Please upload another image and try again.",
          );
          break;
        case "queued":
        case "processing":
        default:
          // Only emit job:updated if the backend status has actually changed.
          if (data.status !== state.job.status) {
            emitter.emit("job:updated", data);
          }
      }
    } catch {
      emitter.emit(
        "job:network_error",
        "Unable to check status. Click the 'Check Status' button to try again.",
      );
    }
  },

  // fetchVariantBlobs downloads binary image data for all variants and creates local ObjectURLs.
  async fetchVariantBlobs(variants) {
    try {
      // Concurrently fetch each variant's binary data and create local ObjectURLs.
      const variantsWithBlobs = await Promise.all(
        variants.map(async (variant) => {
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
