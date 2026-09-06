import { state } from "./state.js";
import { formatMimeType, formatBytes, escapeHTML } from "./helpers.js";

// renderResults renders the image variants processed by the job.
export function renderResults() {
  // Get the container element and necessary state values.
  const container = document.querySelector("#results");
  if (!container) return;
  const { variants, error } = state.results;

  // Add initial content.
  let content = `
    <div class="section-header">
      <h3><span>🖼️</span> Generated Image Variants</h3>
    </div>
  `;

  // NO VARIANTS BRANCH
  if (!variants || variants.length === 0) {
    content += `
      <div>🖼️</div>
      <div><strong>No Images Generated Yet</strong></div>
      <div class="text-muted">Processed image variants will appear here.</div>
    `;
  }
  // VARIANTS AVAILABLE BRANCH
  else {
    // Iterate over variants and add to content.
    content += `<div class="results-grid">`;
    variants.forEach((variant) => {
      const safeLabel = escapeHTML(variant.label || "Variant");
      const displayUrl = variant.localURL || variant.url;
      const safeUrl = escapeHTML(displayUrl);
      const safeDownloadName = escapeHTML(variant.name || `${safeLabel}.png`);
      const safeMime = variant.mimeType ? formatMimeType(variant.mimeType) : "";
      const safeSize = variant.sizeBytes ? formatBytes(variant.sizeBytes) : "";
      const dimensions =
        variant.width && variant.height
          ? `${variant.width}px × ${variant.height}px`
          : "";

      content += `
        <div class="variant-card">
          <div class="variant-image-wrapper">
            <img src="${safeUrl}" alt="${safeLabel}" class="img-variant" />
          </div>
          <div class="variant-details">
            <div class="variant-title"><strong>${safeLabel}</strong></div>
            <div class="variant-meta text-muted">
              ${safeMime ? `<span>${safeMime}</span>` : ""}
              ${safeSize ? `<span>${safeSize}</span>` : ""}
              ${dimensions ? `<span>${dimensions}</span>` : ""}
            </div>
          </div>
          <div class="variant-actions">
            <a href="${safeUrl}" download="${safeDownloadName}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
              Download
            </a>
          </div>
        </div>
      `;
    });
    content += `</div>`;
  }

  // Results Level Error Display
  if (error) {
    const safeError = escapeHTML(error);
    content += `
      <div class="results-error">
        <strong>Error fetching results:</strong> ${safeError}
      </div>
    `;
  }

  // Convert the content string to DOM elements and replace the container's children.
  const tpl = document.createElement("template");
  tpl.innerHTML = content.trim();
  container.replaceChildren(tpl.content);
}
