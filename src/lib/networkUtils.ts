/**
 * Lightweight network connectivity helpers.
 * Uses a fetch probe against Supabase (already configured) so no extra
 * dependency is required.
 */

let _isOnline = true;
const _listeners: Array<(online: boolean) => void> = [];

/** Returns the last known connectivity state (synchronous). */
export function getIsOnline(): boolean {
  return _isOnline;
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function onConnectivityChange(
  cb: (online: boolean) => void,
): () => void {
  _listeners.push(cb);
  return () => {
    const idx = _listeners.indexOf(cb);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

function _notify(online: boolean) {
  if (_isOnline === online) return; // no change
  _isOnline = online;
  _listeners.forEach((cb) => cb(online));
}

/**
 * Probe network by attempting a fetch to the Supabase URL.
 * Falls back gracefully if the env variable is missing.
 */
export async function probeConnectivity(): Promise<boolean> {
  try {
    const base =
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
    const url = `${base}/rest/v1/`; // lightweight endpoint, no auth needed
    const res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    const online = res.status < 500;
    _notify(online);
    return online;
  } catch {
    _notify(false);
    return false;
  }
}

/** Start polling every `intervalMs` (default 30 s). Returns a stop function. */
export function startConnectivityPolling(intervalMs = 30_000): () => void {
  probeConnectivity();
  const id = setInterval(probeConnectivity, intervalMs);
  return () => clearInterval(id);
}
