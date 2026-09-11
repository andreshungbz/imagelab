import { icon } from "./icons.js";

// formatMimeType converts a MIME type to a human-readable format.
export function formatMimeType(mimeType) {
  if (!mimeType) return "";

  const map = {
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
  };

  return map[mimeType.toLowerCase()] || "";
}

// formatBytes converts a byte count to a human-readable string.
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// escapeHTML sanitizes untrusted display values to prevent XSS.
export function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  // Escape quotes to prevent breaking out of HTML attributes.
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// getStepStatusIcon determines the status badge for a processing step.
export function getStepStatusIcon(status) {
  switch (status) {
    case "completed":
      return icon("check");
    case "active":
      return "";
    case "failed":
      return icon("close");
    case "pending":
    default:
      return "";
  }
}
