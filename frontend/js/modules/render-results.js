import { state } from "./state.js";
import { formatMimeType, formatBytes, escapeHTML } from "./helpers.js";
import { icon } from "./icons.js";

// renderResults generates the HTML for the results section.
export function renderResults() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#results");
  if (!container) return;
  const { image_variants: variants, error } = state.results;

  // Determine if the job is currently processing based on its public ID and status.
  const isProcessing =
    Boolean(state.job.publicID) &&
    ["pending", "queued", "processing"].includes(state.job.status);

  // Determine if the job is completed but awaiting blob URLs.
  const isCompletedAwaitingBlobs =
    state.job.status === "completed" && variants.length === 0 && !error;

  // Set results placeholder if processing or awaiting blobs, otherwise set the variants.
  const displayedVariants = variants.length
    ? variants
    : isProcessing || isCompletedAwaitingBlobs
      ? ["Thumbnail", "Preview", "Display"].map((label) => ({
          label,
          status: "pending",
        }))
      : [];

  // Initial section header.
  let content = `
    <div class="section-header">
      <h3 id="results-heading">${icon("image")} Generated Image Variants</h3>
    </div>`;

  // If there are no displayed variants, show an empty state message.
  if (!displayedVariants.length) {
    content += `
      <div class="empty-state results-empty">
        <div class="empty-icon">${icon("image")}</div>
        <strong>No Images Generated Yet</strong>
        <p>Processed image variants will appear here.</p>
      </div>`;
  } else {
    // Otherwise, render the variant cards.

    // Grid start
    content += `<div class="results-grid">`;

    displayedVariants.forEach((variant) => {
      // Variant Name
      const name = variant.name
        ? variant.name.charAt(0).toUpperCase() + variant.name.slice(1)
        : "";
      const label = name || "Variant";
      const safeLabel = escapeHTML(label);

      // Variant Blob URL
      const displayURL = variant.localURL || variant.url;

      // Ready Status
      const isReady =
        Boolean(displayURL) &&
        (!variant.status || ["ready", "completed"].includes(variant.status));
      const isFailed = variant.status === "failed";
      const variantStatus = isReady ? "ready" : isFailed ? "failed" : "pending";
      const safeURL = escapeHTML(
        isReady ? displayURL : state.upload.previewURL,
      );
      const safeDownloadName = escapeHTML(variant.name || `${label}.png`);

      // Format, Size, and Dimensions
      const mime = variant.mimeType ? formatMimeType(variant.mimeType) : "";
      const size = variant.sizeBytes ? formatBytes(variant.sizeBytes) : "";
      const dimensions =
        variant.width && variant.height
          ? `${variant.width} × ${variant.height}`
          : "";

      content += `
        <article class="variant-card variant-${variantStatus}">
          <div class="variant-image-wrapper">
            ${safeURL ? `<img src="${safeURL}" alt="${isReady ? safeLabel : "Source preview; variant not yet available"}" class="img-variant" />` : icon("image")}
          </div>
          <div class="variant-details">
            <span class="badge badge-${variantStatus}">${icon(isReady ? "check" : isFailed ? "close" : "clock")} ${isReady ? "Ready" : isFailed ? "Failed" : "Pending"}</span>
            <div class="variant-title"><strong>${safeLabel}</strong></div>
            <div class="variant-meta text-muted">
              ${dimensions ? `<span>${dimensions}</span>` : ""}
              ${mime ? `<span>${mime}</span>` : ""}
              ${size ? `<span>${size}</span>` : ""}
              ${!isReady ? `<span>${isFailed ? "Unavailable" : "Awaiting Variant"}</span>` : ""}
            </div>
          </div>
          <div class="variant-actions">
            ${
              isReady
                ? `
              <a href="${safeURL}" download="${safeDownloadName}" target="_blank" rel="noopener noreferrer"
                class="btn btn-secondary" aria-label="Download ${safeLabel}" title="Download ${safeLabel}">${icon("download")}</a>`
                : `
              <button type="button" class="btn btn-secondary" disabled aria-label="${safeLabel} download unavailable">${icon("download")}</button>`
            }
          </div>
        </article>
      `;
    });

    // Grid end
    content += `</div>`;
  }

  // Results Level Error Display
  if (error) {
    content += `<div class="results-error" role="alert"><strong>Error fetching results:</strong> ${escapeHTML(error)}</div>`;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
