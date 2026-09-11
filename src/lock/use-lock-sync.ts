import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { syncLock, type LockStatus } from '@/lock/engine';
import { DEFAULT_LOCK_CONFIG, MAX_ROLLING_DAYS, type DayPrayers } from '@/lock/schedule';
import { PRAYER_NAMES } from '@/prayer/methods';
import { computePrayerTimes } from '@/prayer/times';
import { useLocation } from '@/store/location';
import { useMenses } from '@/store/tracker';
import { excludedKeys } from '@/tracker/menses';
import { useSettings } from '@/store/settings';

/**
 * Rewrites the lock schedule whenever it could have gone stale.
 *
 * On mount, on every foreground, and whenever the method, madhab, offsets or
 * location change — all of which move every prayer time and therefore every
 * lock window.
 *
 * The foreground trigger is not a nicety. iOS allows only 20 DeviceActivity
 * monitors, which is roughly four days of five prayers, so the schedule is a
 * rolling horizon that only stays correct because it is rewritten each time the
 * app is opened.
 */
export function useLockSync(enabled: boolean): LockStatus | null {
  const { settings, ready: settingsReady } = useSettings();
  const { location, ready: locationReady } = useLocation();
  const { menses, ready: mensesReady } = useMenses();
  const [status, setStatus] = useState<LockStatus | null>(null);

  useEffect(() => {
    // No synchronous setState here: the inactive case is DERIVED at the return
    // instead, which keeps the effect from causing a cascading render.
    // `mensesReady` is not optional. A cold start without it writes a four-day
    // horizon of schedules from an empty menses default — and those schedules
    // fire whether or not the app is ever opened again, shielding someone who is
    // exempt. That failure is far worse than the lock resuming a day late.
    if (!enabled || !settingsReady || !locationReady || !mensesReady || !location) return;

    const run = () => {
      const today = new Date();
      // One day MORE than the horizon: the last day's Isha window needs the
      // next day's Fajr to know where to end. Without it that window is dropped
      // as zero-length rather than silently guessed.
      const days: DayPrayers[] = Array.from({ length: MAX_ROLLING_DAYS + 1 }, (_, i) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        const times = computePrayerTimes(location.coords, date, settings);
        return {
          date,
          prayers: PRAYER_NAMES.map((name) => ({ name, start: times.prayers[name] })),
        };
      });
      syncLock(
        days,
        {
          ...DEFAULT_LOCK_CONFIG,
          // Menses and travel days write NO schedules at all.
          excludedDays: excludedKeys(menses, today, MAX_ROLLING_DAYS + 1),
        },
        today,
      ).then(setStatus);
    };

    run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, settingsReady, locationReady, mensesReady, location, settings, menses]);

  const active = enabled && settingsReady && locationReady && mensesReady && !!location;
  return active ? status : null;
}
