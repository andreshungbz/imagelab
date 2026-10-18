import { state } from "./state.js";
import { formatMimeType, formatBytes, escapeHTML } from "./helpers.js";
import { icon } from "./icons.js";

// renderResults generates the HTML for the results section supporting progressive variant rendering.
export function renderResults() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#results");
  if (!container) return;
  const { image_variants: variants, error } = state.results;

  // Expected variant definitions for progress placeholders before state receives them.
  const EXPECTED_VARIANTS = ["thumbnail", "preview", "display"];

  // Determine if the job is currently active or processing.
  const isProcessing =
    Boolean(state.job.publicID) &&
    ["pending", "queued", "processing"].includes(state.job.status);

  // Determine if the job failed.
  const isFailedJob = state.job.status === "failed";

  // Build the list of variant items to display.
  let displayedVariants = [];

  if (variants.length > 0) {
    // Render existing state variants, plus placeholders for uncompleted expected variants if still processing or failed.
    displayedVariants = [...variants];

    if (isProcessing || isFailedJob) {
      EXPECTED_VARIANTS.forEach((expectedName) => {
        const exists = variants.some((v) => v.name === expectedName);
        if (!exists) {
          displayedVariants.push({
            name: expectedName,
            status: isFailedJob ? "failed" : "pending",
          });
        }
      });
    }
  } else if (isProcessing || isFailedJob) {
    // Job is active/failed but no intermediate variants arrived; show placeholders.
    displayedVariants = EXPECTED_VARIANTS.map((name) => ({
      name,
      status: isFailedJob ? "failed" : "pending",
    }));
  }

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
        <p>Processed image variants will appear here progressively.</p>
      </div>`;
  } else {
    // Otherwise, render the variant cards grid.
    content += `<div class="results-grid">`;

    displayedVariants.forEach((variant) => {
      // Variant Label
      const rawName = variant.name || "variant";
      const label = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const safeLabel = escapeHTML(label);

      // Variant Object URL / Image Source
      const displayURL = variant.localURL || variant.url;

      // Variant Ready / Failed Status (PROG-03)
      const isReady = Boolean(variant.localURL);
      const isFailed = variant.status === "failed" || (isFailedJob && !isReady);
      const variantStatus = isReady ? "ready" : isFailed ? "failed" : "pending";
      const safeURL = escapeHTML(
        isReady ? displayURL : state.upload.previewURL || "",
      );
      const safeDownloadName = escapeHTML(`${rawName}.png`);

      // Format, Size, and Dimensions Metadata
      const mime = variant.mimeType ? formatMimeType(variant.mimeType) : "";
      const size = variant.sizeBytes ? formatBytes(variant.sizeBytes) : "";
      const dimensions =
        variant.width && variant.height
          ? `${variant.width} × ${variant.height}`
          : "";

      content += `
        <article class="variant-card variant-${variantStatus}">
          <div class="variant-image-wrapper">
            ${
              safeURL
                ? `<img src="${safeURL}" alt="${isReady ? safeLabel : "Source preview; variant generating..."}" class="img-variant ${!isReady ? "img-preview-faded" : ""}" />`
                : icon("image")
            }
          </div>
          <div class="variant-details">
            <span class="badge badge-${variantStatus}">
              ${icon(isReady ? "check" : isFailed ? "close" : "clock")}
              ${isReady ? "Ready" : isFailed ? "Failed" : "Awaiting Variant"}
            </span>
            <div class="variant-title"><strong>${safeLabel}</strong></div>
            <div class="variant-meta text-muted">
              ${dimensions ? `<span>${dimensions}</span>` : ""}
              ${mime ? `<span>${mime}</span>` : ""}
              ${size ? `<span>${size}</span>` : ""}
              ${!isReady ? `<span>${isFailed ? "Unavailable" : "Processing..."}</span>` : ""}
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
