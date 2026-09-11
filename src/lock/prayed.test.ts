import { describe, expect, it } from 'vitest';

import { EMPTY_TRACKER, type TrackerState, marksForDay, prayed } from './prayed';
import { makeWindow, minuteOfDay, windowFrom } from './window';

const MINUTE = 60_000;

/** Fajr called at 05:00 on Friday 2026-09-11, shielding for 30 minutes. */
const fajrStart = new Date(2026, 8, 11, 5, 0);
const fajrWindow = windowFrom(minuteOfDay(fajrStart), 30);
const fajr = (at: number) => ({ flag: { prayer: 'fajr', at }, window: fajrWindow, windowStart: fajrStart });

describe('prayed()', () => {
  it('marks a tap inside the window as on time and clears the shield', () => {
    const { state, clearShield, mark } = prayed(EMPTY_TRACKER, fajr(fajrStart.getTime() + 10 * MINUTE));

    expect(clearShield).toBe(true);
    expect(mark?.onTime).toBe(true);
    expect(mark?.dateKey).toBe('2026-09-11');
    expect(state.totalPrayed).toBe(1);
    expect(state.onTime).toBe(1);
    expect(state.late).toBe(0);
    expect(state.daysActive).toBe(1);
  });

  it('is exact at the window boundary', () => {
    const opened = fajrStart.getTime();
    const closed = opened + 30 * MINUTE;

    expect(prayed(EMPTY_TRACKER, fajr(opened)).mark?.onTime).toBe(true);
    expect(prayed(EMPTY_TRACKER, fajr(closed - 1)).mark?.onTime).toBe(true);
    // Half-open, matching containsMinute: the closing instant is already late.
    expect(prayed(EMPTY_TRACKER, fajr(closed)).mark?.onTime).toBe(false);
    expect(prayed(EMPTY_TRACKER, fajr(closed + MINUTE)).mark?.onTime).toBe(false);
    // Before the adhan is not "on time" either.
    expect(prayed(EMPTY_TRACKER, fajr(opened - MINUTE)).mark?.onTime).toBe(false);
  });

  it('still clears the shield when the prayer is late', () => {
    const result = prayed(EMPTY_TRACKER, fajr(fajrStart.getTime() + 5 * 60 * MINUTE));

    expect(result.clearShield).toBe(true);
    expect(result.state.late).toBe(1);
    expect(result.state.totalPrayed).toBe(1);
  });

  it('files a midnight-crossing Isha under the day it was called', () => {
    const ishaStart = new Date(2026, 8, 11, 23, 45); // Friday
    const window = windowFrom(minuteOfDay(ishaStart), 45); // 23:45 - 00:30
    const tappedSaturday = new Date(2026, 8, 12, 0, 10).getTime();

    const { mark } = prayed(EMPTY_TRACKER, {
      flag: { prayer: 'isha', at: tappedSaturday },
      window,
      windowStart: ishaStart,
    });

    expect(mark?.onTime).toBe(true);
    expect(mark?.dateKey).toBe('2026-09-11');
  });

  it('does not call a tap 24h later "on time" just because the clock matches', () => {
    const ishaStart = new Date(2026, 8, 11, 23, 45);
    const window = windowFrom(minuteOfDay(ishaStart), 45);
    const nextNight = new Date(2026, 8, 13, 0, 10).getTime();

    const { mark } = prayed(EMPTY_TRACKER, {
      flag: { prayer: 'isha', at: nextNight },
      window,
      windowStart: ishaStart,
    });

    expect(mark?.onTime).toBe(false);
  });

  it('is idempotent — the App Group flag can legitimately arrive twice', () => {
    const first = prayed(EMPTY_TRACKER, fajr(fajrStart.getTime() + MINUTE));
    const second = prayed(first.state, fajr(fajrStart.getTime() + MINUTE));

    expect(second.state).toBe(first.state);
    expect(second.clearShield).toBe(true);
    expect(second.mark).toEqual(first.mark);
    expect(second.state.totalPrayed).toBe(1);
  });

  it('normalises the prayer key and rejects a malformed flag', () => {
    expect(prayed(EMPTY_TRACKER, fajr(fajrStart.getTime())).mark?.prayer).toBe('fajr');
    expect(
      prayed(EMPTY_TRACKER, { ...fajr(1), flag: { prayer: 'Fajr', at: fajrStart.getTime() } }).mark
        ?.prayer,
    ).toBe('fajr');

    for (const bad of [
      { prayer: '', at: fajrStart.getTime() },
      { prayer: '  ', at: fajrStart.getTime() },
      { prayer: 'fajr', at: Number.NaN },
      { prayer: 'fajr', at: 0 },
      { prayer: 'fajr', at: -1 },
    ]) {
      const result = prayed(EMPTY_TRACKER, { ...fajr(1), flag: bad as never });
      expect(result.clearShield).toBe(false);
      expect(result.mark).toBeNull();
      expect(result.state).toBe(EMPTY_TRACKER);
    }
  });

  it('counts distinct active days without ever counting a day twice', () => {
    let state = EMPTY_TRACKER;
    for (const [dayOffset, name] of [
      [0, 'fajr'],
      [0, 'dhuhr'],
      [1, 'fajr'],
      [3, 'isha'],
    ] as const) {
      const start = new Date(2026, 8, 11 + dayOffset, 5, 0);
      state = prayed(state, {
        flag: { prayer: name, at: start.getTime() + MINUTE },
        window: windowFrom(minuteOfDay(start), 30),
        windowStart: start,
      }).state;
    }

    expect(state.totalPrayed).toBe(4);
    expect(state.daysActive).toBe(3);
    expect(state.lastDateKey).toBe('2026-09-14');
    expect(marksForDay(state, '2026-09-11').map((m) => m.prayer)).toEqual(['fajr', 'dhuhr']);
  });

  it('only ever counts up — no debt, no negative, no broken streak', () => {
    const numeric = (s: TrackerState) => [s.totalPrayed, s.onTime, s.late, s.daysActive];

    let state = EMPTY_TRACKER;
    let previous = numeric(state);

    // A deliberately ragged month: some on time, some very late, whole days
    // skipped entirely. Nothing may ever go down.
    for (const [dayOffset, lateMinutes] of [
      [0, 0],
      [1, 600],
      [2, 0],
      [9, 5000],
      [10, 0],
    ] as const) {
      const start = new Date(2026, 8, 11 + dayOffset, 5, 0);
      state = prayed(state, {
        flag: { prayer: 'fajr', at: start.getTime() + lateMinutes * MINUTE },
        window: windowFrom(minuteOfDay(start), 30),
        windowStart: start,
      }).state;

      const now = numeric(state);
      now.forEach((value, i) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeGreaterThanOrEqual(previous[i]);
      });
      previous = now;
    }

    expect(state.totalPrayed).toBe(5);
    expect(state.onTime).toBe(3);
    expect(state.late).toBe(2);
    expect(state.onTime + state.late).toBe(state.totalPrayed);
    // The tracker has no concept of a missed or owed prayer.
    expect(Object.keys(state)).not.toContain('missed');
    expect(Object.keys(state).join(' ')).not.toMatch(/missed|debt|owed|streak/i);
  });

  it('treats a zero-length window as never on time', () => {
    const start = new Date(2026, 8, 11, 5, 0);
    const { mark } = prayed(EMPTY_TRACKER, {
      flag: { prayer: 'fajr', at: start.getTime() },
      window: makeWindow(minuteOfDay(start), minuteOfDay(start)),
      windowStart: start,
    });

    expect(mark?.onTime).toBe(false);
  });
});
