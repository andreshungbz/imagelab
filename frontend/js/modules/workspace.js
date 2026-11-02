// ==================================================================================== //
// WORKSPACE HEALTH INDICATOR
// ==================================================================================== //

// initWorkspace performs a lightweight API check and updates the header indicator.
export async function initWorkspace() {
  const workspaceEl = document.getElementById("workspace");
  if (!workspaceEl) return;

  // Resolve the API host from the page location so the static frontend is portable.
  const API_HOST = window.location.hostname;
  const API_BASE = `http://${API_HOST}:4000`;

  // OPTIONS is sufficient here; no image or job data is created by this check.
  try {
    const res = await fetch(`${API_BASE}/v1/images`, { method: "OPTIONS" });
    if (res.ok || res.status < 500) {
      workspaceEl.className = "workspace workspace-online";
      workspaceEl.textContent = `${API_HOST.toUpperCase()}`;
    } else {
      throw new Error("Server error");
    }
  } catch {
    workspaceEl.className = "workspace workspace-offline";
    workspaceEl.textContent = `${API_HOST.toUpperCase()} (Offline)`;
  }
}

initWorkspace();
