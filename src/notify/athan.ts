/**
 * Scheduling the athan.
 *
 * The decision of *what* to schedule is pure and tested in `plan.ts` — the
 * 64-notification cap, nearest-first ordering, and the no-churn diff. This file
 * is only the edge that talks to the OS.
 *
 * ## The constraint, restated because it is the whole design
 *
 * **iOS keeps at most 64 pending local notifications per app.** Five prayers a
 * day is ~12.8 days of runway, and past the cap further requests are dropped
 * silently. So the queue is rewritten on every foreground. If the app is never
 * opened, the athan goes quiet after about twelve days — that is a property of
 * the platform, not a bug we can code around.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { MARK_LABEL } from '@/prayer/labels';
import type { PrayerName } from '@/prayer/methods';
import { PRAYER_NAMES } from '@/prayer/methods';
import type { PrayerSettings } from '@/prayer/settings';
import { computePrayerTimes, type Coords } from '@/prayer/times';
import {
  DEFAULT_ATHAN,
  planAthanNotifications,
  type AthanPlan,
  type AthanSettings,
  type DayTimes,
} from '@/notify/plan';

/** Bundled CC0 recording, trimmed to 29s. Registered by the config plugin. */
export const ADHAN_SOUND = 'adhan.wav';

/** Enough days that the 64-cap, not the horizon, is what limits the queue. */
const HORIZON_DAYS = 16;

/**
 * Foreground presentation. A prayer time is worth interrupting for — that is the
 * entire point of the feature — so it shows and sounds even with the app open.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Do not ask again if the user has explicitly denied — iOS will not re-prompt
  // anyway, and the UI needs to send them to Settings instead.
  if (!existing.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

function title(prayer: PrayerName): string {
  return `${MARK_LABEL[prayer].latin} · ${MARK_LABEL[prayer].arabic}`;
}

/**
 * Rewrite the whole queue.
 *
 * Cancel-all-then-reschedule rather than a surgical diff: 64 items is nothing,
 * the operation is idempotent, and it means a method or location change can
 * never leave a stale notification behind announcing the wrong minute. The diff
 * in `planDiffers` is used only to skip the work entirely when nothing moved.
 */
export async function syncAthanNotifications(
  coords: Coords,
  settings: PrayerSettings,
  athan: AthanSettings = DEFAULT_ATHAN,
  now = new Date(),
): Promise<AthanPlan | null> {
  if (!(await hasNotificationPermission())) return null;

  const days: DayTimes[] = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const times = computePrayerTimes(coords, date, settings);
    return {
      date,
      prayers: Object.fromEntries(
        PRAYER_NAMES.map((p) => [p, times.prayers[p]]),
      ) as Record<PrayerName, Date>,
    };
  });

  const plan = planAthanNotifications(days, athan, now);

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const item of plan.notifications) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: {
        title: title(item.prayer),
        body: 'It is time to pray.',
        sound: athan.fullAthan ? ADHAN_SOUND : undefined,
        // No badge: a number on the icon reads as an unpaid debt, and this app
        // never does that. See DESIGN.md.
        badge: undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.at,
      },
    });
  }

  return plan;
}

export async function cancelAthanNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** For the settings screen: how far the queue currently reaches. */
export async function scheduledCount(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}
