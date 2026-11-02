// localStorage writes throw QuotaExceededError once the origin's quota is full.
// A failed write must never crash a render or a click — the value simply stays
// in memory for the session.

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

// Storage used by this origin, newest keys first, so the biggest offenders can be reported
export function storageUsage() {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      bytes += (key?.length || 0) + (localStorage.getItem(key)?.length || 0);
    }
  } catch {}
  return bytes;
}