import { emitter } from "./event-emitter.js";
import { state } from "./state.js";

const API_BASE = "http://localhost:4000/v1";

// DataService is the layer that interacts with the server API to interact
// with the database.
export const DataService = {
  // uploadImage sends the image file to the server API
  async uploadImage(file) {
    try {
      // Prepare image data and send POST request.
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/images`, {
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
      // TypeError triggers on network failure (e.g., "Failed to fetch" when server is down).
      const userMessage =
        err instanceof TypeError
          ? "Unable to connect to the server. The server may be down."
          : err.message;

      emitter.emit("upload:error", userMessage);
    }
  },

  // pollJobStatus polls the server for status updates on a processing job.
  async pollJobStatus(publicID) {
    try {
      const res = await fetch(`${API_BASE}/jobs/${publicID}`);
      // Handle HTTP level errors (500, 503, 404) as transport/server availability issues.
      if (!res.ok) {
        throw new Error(`Server temporarily unreachable (${res.status})`);
      }

      const data = await res.json();
      switch (data.status) {
        case "completed":
          emitter.emit("job:completed", data);
          break;
        case "failed":
          emitter.emit(
            "job:failed",
            data.error || "Job failed during processing",
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
    } catch (err) {
      emitter.emit("job:network_error", err.message);
    }
  },

  // fetchVariantBlobs downloads binary image data for all variants and creates local ObjectURLs.
  async fetchVariantBlobs(variants) {
    try {
      // Concurrently fetch each variant's binary data and create local ObjectURLs.
      const variantsWithBlobs = await Promise.all(
        variants.map(async (variant) => {
          const res = await fetch(variant.url);
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
