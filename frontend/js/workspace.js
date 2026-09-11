// initWorkspace dynamically checks the status of the API server.
export async function initWorkspace() {
  const workspaceEl = document.getElementById("workspace");
  if (!workspaceEl) return;

  const host = window.location.hostname;
  const apiBase = `http://${host}:4000`;

  try {
    // Send a lightweight check to test if backend on port 4000 is reachable.
    const res = await fetch(`${apiBase}/v1/images`, { method: "OPTIONS" });

    if (res.ok || res.status < 500) {
      workspaceEl.className = "workspace workspace-online";
      workspaceEl.textContent = `${host.toUpperCase()}`;
    } else {
      throw new Error("Server error");
    }
  } catch {
    workspaceEl.className = "workspace workspace-offline";
    workspaceEl.textContent = `${host.toUpperCase()} (Offline)`;
  }
}

initWorkspace();
