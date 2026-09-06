import { renderImageInput } from "./render-image-input.js";
import { renderJobStatus } from "./render-job-status.js";
import { renderResults } from "./render-results.js";

// render calls the individual render functions to update the UI.
export function render() {
  renderImageInput();
  renderJobStatus();
  renderResults();
}
