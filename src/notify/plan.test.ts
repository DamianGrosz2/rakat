import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ATHAN,
  IOS_PENDING_LIMIT,
  notificationId,
  planAthanNotifications,
  planDiffers,
  type AthanSettings,
  type DayTimes,
} from './plan.ts';

/** A day of plausible Berlin times, offset by `dayOffset` days from 2026-09-11. */
function day(dayOffset: number): DayTimes {
  const base = new Date(2026, 8, 11 + dayOffset);
  const at = (h: number, m: number) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
  return {
    date: base,
    prayers: {
      fajr: at(4, 52),
      dhuhr: at(13, 10),
      asr: at(17, 15),
      maghrib: at(19, 29),
      isha: at(21, 11),
    },
  };
}

const days = (n: number) => Array.from({ length: n }, (_, i) => day(i));
const midnight = new Date(2026, 8, 11, 0, 0);

describe('the iOS 64-notification cap', () => {
  it('never schedules more than the limit, however many days it is given', () => {
    // 60 days x 5 prayers = 300 wanted. Silently dropping past 64 is exactly the
    // bug that produces "it stopped calling the adhan after two weeks".
    const plan = planAthanNotifications(days(60), DEFAULT_ATHAN, midnight);
    expect(plan.notifications).toHaveLength(IOS_PENDING_LIMIT);
    expect(plan.dropped).toBe(300 - IOS_PENDING_LIMIT);
  });

  it('keeps the NEAREST notifications, not an arbitrary 64', () => {
    const plan = planAthanNotifications(days(60), DEFAULT_ATHAN, midnight);
    const times = plan.notifications.map((n) => n.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The first is the very next prayer after `now`.
    expect(plan.notifications[0].at).toEqual(day(0).prayers.fajr);
  });

  it('covers about 12.8 days at five prayers a day — the reason we re-plan on open', () => {
    const plan = planAthanNotifications(days(60), DEFAULT_ATHAN, midnight);
    const spanDays =
      (plan.coversUntil!.getTime() - midnight.getTime()) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBeGreaterThan(12);
    expect(spanDays).toBeLessThan(13);
  });

  it('reports no drops when everything fits', () => {
    const plan = planAthanNotifications(days(5), DEFAULT_ATHAN, midnight);
    expect(plan.notifications).toHaveLength(25);
    expect(plan.dropped).toBe(0);
  });
});

describe('what goes in the queue', () => {
  it('skips prayers already past', () => {
    // 18:00 on day 0: fajr, dhuhr and asr have gone.
    const plan = planAthanNotifications(days(1), DEFAULT_ATHAN, new Date(2026, 8, 11, 18, 0));
    expect(plan.notifications.map((n) => n.prayer)).toEqual(['maghrib', 'isha']);
  });

  it('skips a prayer at exactly now — re-registering it would double-fire', () => {
    const plan = planAthanNotifications(days(1), DEFAULT_ATHAN, day(0).prayers.asr);
    expect(plan.notifications.map((n) => n.prayer)).toEqual(['maghrib', 'isha']);
  });

  it('honours per-prayer athan switches', () => {
    const fajrOnly: AthanSettings = {
      ...DEFAULT_ATHAN,
      enabled: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
    };
    const plan = planAthanNotifications(days(10), fajrOnly, midnight);
    expect(plan.notifications).toHaveLength(10);
    expect(new Set(plan.notifications.map((n) => n.prayer))).toEqual(new Set(['fajr']));
  });

  it('returns an empty plan, not a crash, when every prayer is switched off', () => {
    const silent: AthanSettings = {
      ...DEFAULT_ATHAN,
      enabled: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    };
    const plan = planAthanNotifications(days(10), silent, midnight);
    expect(plan.notifications).toHaveLength(0);
    expect(plan.coversUntil).toBeNull();
    expect(plan.dropped).toBe(0);
  });

  it('gives every notification a stable, unique id', () => {
    const plan = planAthanNotifications(days(13), DEFAULT_ATHAN, midnight);
    const ids = plan.notifications.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(notificationId(new Date(2026, 8, 11), 'fajr')).toBe('2026-09-11:fajr');
  });
});

describe('re-planning does not churn the queue', () => {
  it('reports no difference when nothing changed', () => {
    const plan = planAthanNotifications(days(20), DEFAULT_ATHAN, midnight);
    expect(planDiffers(plan, plan.notifications)).toBe(false);
  });

  it('notices when a time moved for the same id', () => {
    // What happens when the user switches method, madhab, offsets or city: the
    // ids are identical, the times are not.
    const plan = planAthanNotifications(days(20), DEFAULT_ATHAN, midnight);
    const shifted = plan.notifications.map((n, i) =>
      i === 3 ? { ...n, at: new Date(n.at.getTime() + 4 * 60_000) } : n,
    );
    expect(planDiffers(plan, shifted)).toBe(true);
  });

  it('notices when the queue is short', () => {
    const plan = planAthanNotifications(days(20), DEFAULT_ATHAN, midnight);
    expect(planDiffers(plan, plan.notifications.slice(1))).toBe(true);
  });
});
