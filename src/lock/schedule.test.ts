import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCK_CONFIG,
  type DayPrayers,
  type LockConfig,
  MAX_MONITORS,
  MAX_ROLLING_DAYS,
  planLockSchedules,
} from './schedule';
import { crossesMidnight, windowDurationMinutes, windowKey } from './window';

// MARK: - Fixtures

/** `day('2026-09-11', ['fajr 05:30', 'dhuhr 13:00'])` */
function day(date: string, prayers: string[]): DayPrayers {
  const [y, mo, d] = date.split('-').map(Number);
  return {
    date: new Date(y, mo - 1, d, 12),
    prayers: prayers.map((entry) => {
      const [name, hhmm] = entry.split(' ');
      const [h, mi] = hhmm.split(':').map(Number);
      return { name, start: new Date(y, mo - 1, d, h, mi) };
    }),
  };
}

const BASE = ['fajr 05:00', 'dhuhr 13:00', 'asr 16:30', 'maghrib 19:45', 'isha 21:15'];

/** Same clock times every day — the collapse case. */
function identicalDays(count: number, from = 11): DayPrayers[] {
  return Array.from({ length: count }, (_, i) => day(`2026-09-${from + i}`, BASE));
}

/** Every day shifted, so no two days share a window — the real case, since
 *  prayer times drift daily. */
function driftingDays(count: number, prayers = BASE, from = 11): DayPrayers[] {
  return Array.from({ length: count }, (_, i) =>
    day(
      `2026-09-${from + i}`,
      prayers.map((entry) => {
        const [name, hhmm] = entry.split(' ');
        const [h, mi] = hhmm.split(':').map(Number);
        const shifted = h * 60 + mi + i * 7;
        return `${name} ${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
      }),
    ),
  );
}

const FIXED_30: LockConfig = { ...DEFAULT_LOCK_CONFIG, jumuah: undefined };
const today = new Date(2026, 8, 11, 8); // Friday 2026-09-11

// MARK: - The 20-monitor budget

describe('monitor budget', () => {
  it('collapses five identical daily windows across 4 days into 5 monitors, not 20', () => {
    const plan = planLockSchedules({ today, days: identicalDays(4), config: FIXED_30 });

    expect(plan.schedules).toHaveLength(5);
    for (const schedule of plan.schedules) {
      expect(schedule.dayIndices).toEqual([0, 1, 2, 3]);
      expect(schedule.weekdays).toEqual([4, 5, 6, 0]); // Fri Sat Sun Mon, Monday-first
    }
    expect(plan.dropped).toEqual([]);
  });

  it('fits the pathological all-different case in exactly the budget', () => {
    const plan = planLockSchedules({ today, days: driftingDays(4), config: FIXED_30 });

    expect(plan.schedules).toHaveLength(20);
    expect(plan.schedules.length).toBeLessThanOrEqual(MAX_MONITORS);
    expect(new Set(plan.schedules.map((s) => windowKey(s.window))).size).toBe(20);
    for (const schedule of plan.schedules) expect(schedule.dayIndices).toHaveLength(1);
  });

  it('drops the furthest-out day when the budget would be exceeded', () => {
    const six = ['tahajjud 03:00', ...BASE];
    const plan = planLockSchedules({
      today,
      days: driftingDays(4, six),
      config: { ...FIXED_30, lockedPrayers: [...FIXED_30.lockedPrayers, 'tahajjud'] },
    });

    // 6 prayers x 4 distinct days = 24 > 20, so day 3 goes.
    expect(plan.schedules).toHaveLength(18);
    expect(plan.schedules.flatMap((s) => s.dayIndices)).not.toContain(3);
    expect(plan.dropped).toEqual([
      {
        dayIndex: 3,
        dateKey: '2026-09-14',
        reason: 'monitorBudget',
        detail: expect.stringContaining('furthest-out day'),
      },
    ]);
    // The nearer days survive untouched.
    expect(new Set(plan.schedules.flatMap((s) => s.dayIndices))).toEqual(new Set([0, 1, 2]));
  });

  it('never exceeds the cap, for any input', () => {
    // Deterministic LCG: prayer times drift daily, so "every day differs" is the
    // normal case, not the edge case. 300 shapes, none may blow the budget.
    let seed = 20260911;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let run = 0; run < 300; run++) {
      const prayerCount = 1 + rand(9);
      const dayCount = rand(8);
      const days: DayPrayers[] = [];
      for (let d = 0; d < dayCount; d++) {
        const names = Array.from({ length: prayerCount }, (_, i) => `p${i}`);
        const times = names
          .map((name) => ({ name, minute: rand(1440) }))
          .sort((a, b) => a.minute - b.minute)
          .map(
            ({ name, minute }) =>
              `${name} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
          );
        days.push(day(`2026-09-${11 + d}`, times));
      }
      const plan = planLockSchedules({
        today,
        days,
        config: {
          lockedPrayers: Array.from({ length: prayerCount }, (_, i) => `p${i}`),
          defaultLength: rand(2) ? { kind: 'fixed', minutes: 5 + rand(120) } : { kind: 'untilNextPrayer', leadOutMinutes: rand(60) },
        },
      });

      expect(plan.schedules.length).toBeLessThanOrEqual(MAX_MONITORS);
      for (const schedule of plan.schedules) {
        expect(windowDurationMinutes(schedule.window)).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('drops the latest windows when a single day alone busts the budget', () => {
    // 24 distinct prayers on one day: tier 2 of the overflow rule.
    const names = Array.from({ length: 24 }, (_, i) => `p${i}`);
    const one = day(
      '2026-09-11',
      names.map((name, i) => `${name} ${String(i).padStart(2, '0')}:00`),
    );
    const plan = planLockSchedules({
      today,
      days: [one],
      config: { lockedPrayers: names, defaultLength: { kind: 'fixed', minutes: 30 } },
    });

    expect(plan.schedules).toHaveLength(MAX_MONITORS);
    expect(plan.schedules.map((s) => s.start.hour)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
    expect(plan.dropped).toHaveLength(4); // 20:00, 21:00, 22:00, 23:00
    expect(plan.dropped.every((d) => d.reason === 'monitorBudget')).toBe(true);
  });

  it('plans at most the rolling window, and ignores days already past', () => {
    const days = [day('2026-09-09', BASE), day('2026-09-10', BASE), ...identicalDays(7)];
    const plan = planLockSchedules({ today, days, config: FIXED_30 });

    const covered = new Set(plan.schedules.flatMap((s) => s.dayIndices));
    expect([...covered].sort()).toEqual([0, 1, 2, 3]);
    expect(covered.size).toBe(MAX_ROLLING_DAYS);
  });
});

// MARK: - Midnight

describe('midnight-crossing windows', () => {
  it('computes a late Isha lock that runs past 00:00', () => {
    const days = [day('2026-09-11', ['isha 23:45'])];
    const plan = planLockSchedules({
      today,
      days,
      config: { lockedPrayers: ['isha'], defaultLength: { kind: 'fixed', minutes: 45 } },
    });

    expect(plan.schedules).toHaveLength(1);
    const isha = plan.schedules[0];
    expect(isha.window).toEqual({ start: 23 * 60 + 45, end: 30 });
    expect(crossesMidnight(isha.window)).toBe(true);
    expect(isha.durationMinutes).toBe(45);
    expect(isha.start).toEqual({ hour: 23, minute: 45 });
    expect(isha.end).toEqual({ hour: 0, minute: 30 });
  });

  it('runs Isha to the next day’s Fajr when the window is "until next prayer"', () => {
    const days = [day('2026-09-11', BASE), day('2026-09-12', BASE)];
    const plan = planLockSchedules({
      today,
      days,
      config: { lockedPrayers: ['isha'], defaultLength: { kind: 'untilNextPrayer', leadOutMinutes: 30 } },
    });

    const isha = plan.schedules.find((s) => s.prayers.includes('isha'))!;
    expect(isha.window).toEqual({ start: 21 * 60 + 15, end: 4 * 60 + 30 });
    expect(isha.durationMinutes).toBe(435);
  });

  it('never inverts a window when the lead-out is longer than the gap', () => {
    const days = [day('2026-09-11', ['maghrib 19:45', 'isha 20:30'])];
    const plan = planLockSchedules({
      today,
      days,
      config: {
        lockedPrayers: ['maghrib'],
        defaultLength: { kind: 'untilNextPrayer', leadOutMinutes: 90 },
      },
    });

    expect(plan.schedules).toEqual([]);
    expect(plan.dropped[0].reason).toBe('zeroLength');
  });
});

// MARK: - Menses / travel

describe('excluded days', () => {
  it('writes zero schedules for an excluded day without shifting the others', () => {
    const days = identicalDays(4);
    const base = planLockSchedules({ today, days, config: FIXED_30 });
    const plan = planLockSchedules({
      today,
      days,
      config: { ...FIXED_30, excludedDays: ['2026-09-12'] },
    });

    expect(plan.schedules.flatMap((s) => s.dayIndices)).not.toContain(1);
    for (const schedule of plan.schedules) expect(schedule.dayIndices).toEqual([0, 2, 3]);

    // The other days keep exactly the windows they had.
    expect(plan.schedules.map((s) => windowKey(s.window))).toEqual(
      base.schedules.map((s) => windowKey(s.window)),
    );
    expect(plan.dropped).toEqual([
      {
        dayIndex: 1,
        dateKey: '2026-09-12',
        reason: 'excludedDay',
        detail: expect.stringContaining('menses/travel'),
      },
    ]);
  });

  it('writes nothing at all when every day is excluded', () => {
    const days = identicalDays(4);
    const plan = planLockSchedules({
      today,
      days,
      config: { ...FIXED_30, excludedDays: days.map((_, i) => `2026-09-${11 + i}`) },
    });

    expect(plan.schedules).toEqual([]);
    expect(plan.dropped).toHaveLength(4);
  });
});

// MARK: - Jumu'ah

describe("jumu'ah", () => {
  const thursday = new Date(2026, 8, 10, 8);
  const twoDays = [day('2026-09-10', BASE), day('2026-09-11', BASE)];

  it('gives Friday a longer Dhuhr window than Thursday', () => {
    const plan = planLockSchedules({ today: thursday, days: twoDays, config: DEFAULT_LOCK_CONFIG });

    const dhuhrs = plan.schedules.filter((s) => s.prayers.includes('dhuhr'));
    expect(dhuhrs).toHaveLength(2);

    const [thu, fri] = dhuhrs;
    expect(thu.dayIndices).toEqual([0]);
    expect(thu.durationMinutes).toBe(30);
    expect(fri.dayIndices).toEqual([1]);
    expect(fri.durationMinutes).toBe(90);
    expect(fri.durationMinutes).toBeGreaterThan(thu.durationMinutes);

    // Only Dhuhr differs: every other prayer still collapses to one monitor.
    const fajr = plan.schedules.find((s) => s.prayers.includes('fajr'))!;
    expect(fajr.dayIndices).toEqual([0, 1]);
  });

  it('treats Friday like any other day when Jumu’ah is off', () => {
    const plan = planLockSchedules({ today: thursday, days: twoDays, config: FIXED_30 });

    const dhuhrs = plan.schedules.filter((s) => s.prayers.includes('dhuhr'));
    expect(dhuhrs).toHaveLength(1);
    expect(dhuhrs[0].dayIndices).toEqual([0, 1]);
  });
});

// MARK: - Rejection and merging

describe('degenerate windows', () => {
  it('rejects zero-length windows instead of scheduling a monitor that never fires', () => {
    const plan = planLockSchedules({
      today,
      days: [day('2026-09-11', BASE)],
      config: { ...FIXED_30, defaultLength: { kind: 'fixed', minutes: 0 } },
    });

    expect(plan.schedules).toEqual([]);
    expect(plan.dropped).toHaveLength(5);
    expect(plan.dropped.every((d) => d.reason === 'zeroLength')).toBe(true);
  });

  it('rejects windows under Apple’s 15-minute floor', () => {
    const plan = planLockSchedules({
      today,
      days: [day('2026-09-11', BASE)],
      config: { ...FIXED_30, defaultLength: { kind: 'fixed', minutes: 10 } },
    });

    expect(plan.schedules).toEqual([]);
    expect(plan.dropped.every((d) => d.reason === 'tooShort')).toBe(true);
    expect(plan.dropped[0].detail).toContain('15-minute');
  });

  it('merges overlapping windows inside a day into one monitor', () => {
    const plan = planLockSchedules({
      today,
      days: [day('2026-09-11', ['maghrib 19:45', 'isha 20:05'])],
      config: { lockedPrayers: ['maghrib', 'isha'], defaultLength: { kind: 'fixed', minutes: 60 } },
    });

    expect(plan.schedules).toHaveLength(1);
    expect(plan.schedules[0].prayers).toEqual(['maghrib', 'isha']);
    expect(plan.schedules[0].durationMinutes).toBe(80);
    expect(plan.dropped).toEqual([]);
  });

  it('ignores prayers that are not locked', () => {
    const plan = planLockSchedules({
      today,
      days: [day('2026-09-11', ['sunrise 06:40', ...BASE])],
      config: FIXED_30,
    });

    expect(plan.schedules).toHaveLength(5);
    expect(plan.schedules.flatMap((s) => s.prayers)).not.toContain('sunrise');
  });
});

describe('monitor identity', () => {
  it('derives a stable id from the window so refreshes replace, not duplicate', () => {
    const first = planLockSchedules({ today, days: identicalDays(4), config: FIXED_30 });
    const second = planLockSchedules({ today, days: identicalDays(2), config: FIXED_30 });

    expect(first.schedules.map((s) => s.id)).toEqual(second.schedules.map((s) => s.id));
    expect(first.schedules[0].id).toBe('salah-0500-0530');
  });
});
