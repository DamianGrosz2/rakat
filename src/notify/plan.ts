/**
 * Which athan notifications to schedule, and in what order.
 *
 * Pure. No expo-notifications import, no Date.now() — everything is passed in,
 * so the whole thing runs under vitest in node. The thin scheduling edge lives
 * in `athan.ts`.
 *
 * ## The constraint that shapes this file
 *
 * **iOS keeps at most 64 pending local notifications per app.** Past 64, further
 * requests are silently dropped — no error, no warning, nothing to notice until
 * a user says "it stopped calling the adhan after two weeks".
 *
 * Five prayers a day is ~12.8 days of runway. So:
 *   - we schedule nearest-first and hard-cap at the limit, and
 *   - the app re-plans on EVERY foreground, which is what actually keeps the
 *     tail topped up.
 *
 * Android has no equivalent cap, but re-planning on open is harmless there and
 * keeping one code path is worth more than the handful of saved alarms.
 */

import type { PrayerName } from '@/prayer/methods';

/** iOS's hard limit on pending local notifications, per app. */
export const IOS_PENDING_LIMIT = 64;

export type AthanSettings = {
  /** Which prayers call the athan. Sunrise is never in here — it is not a prayer. */
  readonly enabled: Readonly<Record<PrayerName, boolean>>;
  /** Play the full recording rather than the default notification sound. */
  readonly fullAthan: boolean;
};

export const DEFAULT_ATHAN: AthanSettings = {
  enabled: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  fullAthan: true,
};

/** One day's prayer times, as the planner wants them. */
export type DayTimes = {
  readonly date: Date;
  readonly prayers: Readonly<Record<PrayerName, Date>>;
};

export type PlannedNotification = {
  /** Stable across re-plans, so an unchanged notification can be left alone. */
  readonly id: string;
  readonly prayer: PrayerName;
  readonly at: Date;
};

export type AthanPlan = {
  readonly notifications: readonly PlannedNotification[];
  /** How many we wanted but could not fit under the cap. Surfaced for diagnostics. */
  readonly dropped: number;
  /**
   * The last moment covered by this plan. If the user does not open the app
   * before this, the athan goes quiet — which is exactly the failure the
   * re-plan-on-open rule exists to prevent.
   */
  readonly coversUntil: Date | null;
};

/** `2026-09-11:fajr` — deterministic, so re-planning does not churn the queue. */
export function notificationId(date: Date, prayer: PrayerName): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}:${prayer}`;
}

/**
 * Build the schedule.
 *
 * @param days   Consecutive days of prayer times, ascending. Give it as many as
 *               you can cheaply compute — more than fits is fine and expected,
 *               the cap does the trimming.
 * @param now    Anything at or before this is already past and is skipped.
 * @param limit  Overridable for tests; defaults to the real iOS cap.
 */
export function planAthanNotifications(
  days: readonly DayTimes[],
  settings: AthanSettings,
  now: Date,
  limit: number = IOS_PENDING_LIMIT,
): AthanPlan {
  const wanted: PlannedNotification[] = [];

  for (const day of days) {
    for (const prayer of Object.keys(day.prayers) as PrayerName[]) {
      if (!settings.enabled[prayer]) continue;
      const at = day.prayers[prayer];
      // Strictly after `now`: a notification for this exact minute has either
      // already fired or is about to, and re-registering it double-fires.
      if (at.getTime() <= now.getTime()) continue;
      wanted.push({ id: notificationId(day.date, prayer), prayer, at });
    }
  }

  // Nearest first. Days arrive ordered but prayers within a day come from an
  // object, so do not trust insertion order for the sort that decides what
  // survives the cap.
  wanted.sort((a, b) => a.at.getTime() - b.at.getTime());

  const notifications = wanted.slice(0, Math.max(0, limit));
  return {
    notifications,
    dropped: wanted.length - notifications.length,
    coversUntil: notifications.length ? notifications[notifications.length - 1].at : null,
  };
}

/**
 * Whether the queue needs rewriting.
 *
 * Re-registering 64 notifications on every foreground is wasteful and makes the
 * queue flap, so compare first. Any difference in the set of ids — or in a
 * time for the same id, which happens when the user changes method, madhab,
 * offsets or location — means rewrite.
 */
export function planDiffers(
  plan: AthanPlan,
  scheduled: readonly PlannedNotification[],
): boolean {
  if (plan.notifications.length !== scheduled.length) return true;
  const existing = new Map(scheduled.map((n) => [n.id, n.at.getTime()]));
  return plan.notifications.some((n) => existing.get(n.id) !== n.at.getTime());
}
