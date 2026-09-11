import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  cancelAthanNotifications,
  hasNotificationPermission,
  requestNotificationPermission,
  syncAthanNotifications,
} from '@/notify/athan';
import { DEFAULT_ATHAN, type AthanPlan } from '@/notify/plan';
import { useLocation } from '@/store/location';
import { useAthanEnabled, useSettings } from '@/store/settings';

/**
 * Keeps the athan queue topped up.
 *
 * Rewrites on mount, on every foreground, and whenever the method, madhab,
 * offsets or location change. The foreground trigger is load-bearing: iOS holds
 * only 64 pending notifications, so the queue is a rolling window that stays
 * correct *because* it is rewritten each time the app is opened.
 */
export function useAthanSync(): {
  plan: AthanPlan | null;
  granted: boolean | null;
  enable: (next: boolean) => Promise<boolean>;
} {
  const { settings, ready: settingsReady } = useSettings();
  const { location, ready: locationReady } = useLocation();
  const { enabled, toggle } = useAthanEnabled();
  const [plan, setPlan] = useState<AthanPlan | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    hasNotificationPermission().then((g) => alive && setGranted(g));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady || !locationReady) return;

    const run = async () => {
      if (!enabled || !location) {
        await cancelAthanNotifications();
        return;
      }
      setPlan(await syncAthanNotifications(location.coords, settings));
    };

    run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, settingsReady, locationReady, location, settings]);

  const enable = useCallback(
    async (next: boolean) => {
      if (next) {
        const ok = await requestNotificationPermission();
        setGranted(ok);
        // Leave the switch off if permission was refused — a toggle that reads
        // "on" while the OS silences every notification is a lie.
        if (!ok) return false;
      }
      await toggle(next);
      return next;
    },
    [toggle],
  );

  const active = enabled && settingsReady && locationReady && !!location;
  return { plan: active ? plan : null, granted, enable };
}

export { DEFAULT_ATHAN };
