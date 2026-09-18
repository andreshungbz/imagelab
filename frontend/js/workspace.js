// initWorkspace dynamically checks the status of the API server.
export async function initWorkspace() {
  const workspaceEl = document.getElementById("workspace");
  if (!workspaceEl) return;

  // Dynamically resolve the API host and base URL based on the current location.
  const API_HOST = window.location.hostname;
  const API_BASE = `http://${API_HOST}:4000`;

  // Send a lightweight check to test if backend on port 4000 is reachable.
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
