import { renderImageInput } from "./render-image-input.js";
import { renderJobStatus } from "./render-job-status.js";
import { renderResults } from "./render-results.js";

// ==================================================================================== //
// RENDER ORCHESTRATION
// ==================================================================================== //

// render updates each independently owned page section from the shared state snapshot.
// The renderers replace only their own container, so delegated handlers remain attached.
export function render() {
  renderImageInput();
  renderJobStatus();
  renderResults();
}
