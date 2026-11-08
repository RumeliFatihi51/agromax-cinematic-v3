const key = "agromax-offline-v1";

export function readOffline() {
  try {
    const state = JSON.parse(localStorage.getItem(key) || "null");
    return state?.field && Array.isArray(state.drafts) && Array.isArray(state.tasks) ? state : null;
  } catch {
    return null;
  }
}

export function writeOffline(state) {
  localStorage.setItem(key, JSON.stringify(state));
}

export function clearOffline() {
  try {
    localStorage.removeItem(key);
  } catch {}
}
