import { emitter } from "./event-emitter.js";
import { state } from "./state.js";

const API_BASE = "/v1";

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

      // Check for response errors.
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data.error?.image || data.error || "Upload failed";
        throw new Error(errorMessage);
      }

      emitter.emit("upload:success", data);
    } catch (err) {
      emitter.emit("upload:error", err.message);
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
