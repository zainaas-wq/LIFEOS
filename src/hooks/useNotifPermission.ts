/**
 * useNotifPermission — tracks notification permission status.
 *
 * - Checks on mount and whenever the app comes to foreground.
 * - Returns { granted, request } so callers can show a soft prompt.
 * - Never requests permission automatically — caller must call request().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  checkPermissionGranted,
  requestPermissions,
} from '../services/notificationService';

export interface NotifPermissionResult {
  /** true once the initial check resolves */
  checked: boolean;
  granted: boolean;
  /** Re-requests permission (shows system dialog). Updates granted on resolution. */
  request: () => void;
}

export function useNotifPermission(): NotifPermissionResult {
  const [checked, setChecked] = useState(false);
  const [granted, setGranted] = useState(true); // optimistic until checked
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const check = useCallback(async () => {
    if (Platform.OS === 'web') { setChecked(true); return; }
    const ok = await checkPermissionGranted();
    if (!mountedRef.current) return;
    setGranted(ok);
    setChecked(true);
  }, []);

  // Check on mount
  useEffect(() => { check(); }, [check]);

  // Re-check when app returns to foreground (user may have toggled in Settings)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const request = useCallback(async () => {
    const ok = await requestPermissions();
    if (!mountedRef.current) return;
    setGranted(ok);
  }, []);

  return { checked, granted, request };
}
