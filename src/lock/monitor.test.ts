import { describe, expect, it } from 'vitest';

import { staleActivityNames, toAppleWeekday, toMonitors } from './monitor.ts';
import { MAX_MONITORS, planLockSchedules, type DayPrayers } from './schedule.ts';

/**
 * Five prayers on the given day, drifting a minute per day so consecutive days
 * produce distinct windows — which is the real case, not a pathological one.
 */
function day(offset: number): DayPrayers {
  const d = new Date(2026, 8, 14 + offset); // 14 Sep 2026 is a Monday
  const at = (h: number, m: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m + offset, 0, 0);
  return {
    date: d,
    prayers: [
      { name: 'fajr', start: at(4, 59) },
      { name: 'dhuhr', start: at(13, 8) },
      { name: 'asr', start: at(17, 31) },
      { name: 'maghrib', start: at(19, 38) },
      { name: 'isha', start: at(21, 6) },
    ],
  };
}

const days = (n: number) => Array.from({ length: n }, (_, i) => day(i));
const monday = new Date(2026, 8, 14);

describe('Apple weekday mapping', () => {
  it('maps Monday-first 0..6 onto Apple 1=Sunday..7=Saturday', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(toAppleWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });
});

describe('the real DeviceActivity budget', () => {
  it('never registers more than 20 monitors, counting weekday expansion', () => {
    // This is the whole point of this module. A collapsed plan can report 20
    // schedules while needing far more monitors once each weekday is its own
    // weekly schedule — and registering past the cap fails SILENTLY.
    const plan = planLockSchedules({ today: monday, days: days(6) });
    const monitors = toMonitors(plan);
    expect(monitors.monitors.length).toBeLessThanOrEqual(MAX_MONITORS);
  });

  it('keeps today before tomorrow when it has to drop', () => {
    const plan = planLockSchedules({ today: monday, days: days(6) });
    const { monitors, dropped } = toMonitors(plan, 7);
    expect(monitors).toHaveLength(7);
    const keptMax = Math.max(...monitors.map((m) => m.dayIndex));
    const droppedMin = Math.min(...dropped.map((m) => m.dayIndex));
    expect(keptMax).toBeLessThanOrEqual(droppedMin);
  });

  it('orders soonest-first within a day', () => {
    const plan = planLockSchedules({ today: monday, days: days(4) });
    const sameDay = toMonitors(plan).monitors.filter((m) => m.dayIndex === 0);
    const mins = sameDay.map((m) => m.intervalStart.hour * 60 + m.intervalStart.minute);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });

  it('gives every monitor a stable, unique activity name', () => {
    const plan = planLockSchedules({ today: monday, days: days(4) });
    const names = toMonitors(plan).monitors.map((m) => m.activityName);
    expect(new Set(names).size).toBe(names.length);
    // Same input must produce the same names, or a refresh duplicates monitors
    // instead of replacing them.
    const again = toMonitors(planLockSchedules({ today: monday, days: days(4) }));
    expect(again.monitors.map((m) => m.activityName)).toEqual(names);
  });

  it('qualifies every schedule with a weekday and repeats weekly', () => {
    const plan = planLockSchedules({ today: monday, days: days(4) });
    for (const m of toMonitors(plan).monitors) {
      expect(m.repeats).toBe(true);
      expect(m.intervalStart.weekday).toBeGreaterThanOrEqual(1);
      expect(m.intervalStart.weekday).toBeLessThanOrEqual(7);
    }
  });
});

describe('windows that cross midnight', () => {
  it('ends on the following weekday', () => {
    // A late-Isha lock running past midnight. Without rolling the weekday the
    // interval is 23.5 hours long instead of 30 minutes, and the shield sits up
    // all day.
    const late: DayPrayers = {
      date: monday,
      prayers: [{ name: 'isha', start: new Date(2026, 8, 14, 23, 45) }],
    };
    const plan = planLockSchedules({
      today: monday,
      days: [late],
      config: {
        lockedPrayers: ['isha'],
        defaultLength: { kind: 'fixed', minutes: 30 },
      },
    });
    const monitors = toMonitors(plan).monitors;
    expect(monitors).toHaveLength(1);
    const m = monitors[0];
    expect(m.intervalStart).toMatchObject({ hour: 23, minute: 45 });
    expect(m.intervalEnd).toMatchObject({ hour: 0, minute: 15 });
    // Monday (2) -> Tuesday (3). Without this the interval is 23h30m, not 30m.
    expect(m.intervalStart.weekday).toBe(2);
    expect(m.intervalEnd.weekday).toBe(3);
  });
});

describe('cleaning up monitors the new plan no longer wants', () => {
  it('lists ours that are no longer wanted, and never touches anyone else’s', () => {
    const plan = toMonitors(planLockSchedules({ today: monday, days: days(2) }));
    const registered = [
      ...plan.monitors.map((m) => m.activityName),
      'rakat.stale.w2',
      'someOtherApp.activity',
    ];
    const stale = staleActivityNames(plan, registered);
    expect(stale).toContain('rakat.stale.w2');
    expect(stale).not.toContain('someOtherApp.activity');
    expect(stale).toHaveLength(1);
  });
});
