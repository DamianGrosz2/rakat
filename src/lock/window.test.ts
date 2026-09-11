import { describe, expect, it } from 'vitest';

import {
  MINIMUM_WINDOW_MINUTES,
  containsMinute,
  crossesMidnight,
  dayKey,
  daysBetween,
  formatMinute,
  isTooShort,
  isZeroLength,
  makeWindow,
  mergeWindows,
  minuteOfDay,
  toWallClock,
  weekdayIndex,
  windowDurationMinutes,
  windowFrom,
  windowKey,
  windowsOverlap,
  wrapMinute,
} from './window';

/** "05:30" -> 330 */
const m = (hhmm: string): number => {
  const [h, min] = hhmm.split(':').map(Number);
  return h * 60 + min;
};
const w = (start: string, end: string) => makeWindow(m(start), m(end));

describe('edge conversions', () => {
  it('reads local minute-of-day off a Date', () => {
    expect(minuteOfDay(new Date(2026, 8, 11, 5, 30))).toBe(330);
    expect(minuteOfDay(new Date(2026, 8, 11, 0, 0))).toBe(0);
    expect(minuteOfDay(new Date(2026, 8, 11, 23, 59))).toBe(1439);
  });

  it('keys days locally and counts whole days between them', () => {
    expect(dayKey(new Date(2026, 8, 11, 23, 59))).toBe('2026-09-11');
    expect(daysBetween('2026-09-11', '2026-09-14')).toBe(3);
    expect(daysBetween('2026-09-11', '2026-09-10')).toBe(-1);
    // Across a DST boundary the day count must still be whole.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('uses Monday-first weekday indices like the Swift original', () => {
    expect(weekdayIndex(new Date(2026, 8, 10, 12))).toBe(3); // Thursday
    expect(weekdayIndex(new Date(2026, 8, 11, 12))).toBe(4); // Friday
    expect(weekdayIndex(new Date(2026, 8, 13, 12))).toBe(6); // Sunday
  });

  it('wraps minutes into 0..1439, negatives included', () => {
    expect(wrapMinute(-30)).toBe(1410);
    expect(wrapMinute(1470)).toBe(30);
    expect(toWallClock(1425)).toEqual({ hour: 23, minute: 45 });
    expect(formatMinute(5)).toBe('00:05');
    expect(windowKey(w('05:30', '06:00'))).toBe('05:30-06:00');
  });
});

describe('duration', () => {
  it('measures a normal window', () => {
    expect(windowDurationMinutes(w('13:00', '14:30'))).toBe(90);
  });

  it('measures a window that crosses midnight', () => {
    const isha = w('23:45', '00:30');
    expect(crossesMidnight(isha)).toBe(true);
    expect(windowDurationMinutes(isha)).toBe(45);
  });

  it('measures a long overnight window', () => {
    expect(windowDurationMinutes(w('21:15', '04:30'))).toBe(435);
  });

  it('reports zero for a zero-length window', () => {
    expect(windowDurationMinutes(w('05:00', '05:00'))).toBe(0);
    expect(isZeroLength(w('05:00', '05:00'))).toBe(true);
  });

  it('builds a forward window from a start and a duration', () => {
    expect(windowFrom(m('23:45'), 45)).toEqual({ start: 1425, end: 30 });
  });
});

describe('containment', () => {
  it('is half-open on a normal window', () => {
    const dhuhr = w('13:00', '13:30');
    expect(containsMinute(dhuhr, m('13:00'))).toBe(true);
    expect(containsMinute(dhuhr, m('13:29'))).toBe(true);
    expect(containsMinute(dhuhr, m('13:30'))).toBe(false);
    expect(containsMinute(dhuhr, m('12:59'))).toBe(false);
  });

  it('is correct across midnight', () => {
    const isha = w('23:45', '00:30');
    expect(containsMinute(isha, m('23:45'))).toBe(true);
    expect(containsMinute(isha, m('23:59'))).toBe(true);
    expect(containsMinute(isha, m('00:00'))).toBe(true);
    expect(containsMinute(isha, m('00:29'))).toBe(true);
    expect(containsMinute(isha, m('00:30'))).toBe(false);
    expect(containsMinute(isha, m('12:00'))).toBe(false);
    expect(containsMinute(isha, m('23:44'))).toBe(false);
  });

  it('never contains anything when zero-length', () => {
    expect(containsMinute(w('05:00', '05:00'), m('05:00'))).toBe(false);
  });
});

describe('guards', () => {
  it('rejects windows under Apple’s 15-minute DeviceActivity floor', () => {
    expect(isTooShort(w('05:00', '05:14'))).toBe(true);
    expect(isTooShort(w('05:00', `05:${MINIMUM_WINDOW_MINUTES}`))).toBe(false);
    // Zero-length is owned by isZeroLength, never double-reported here.
    expect(isTooShort(w('05:00', '05:00'))).toBe(false);
  });

  it('detects overlap, midnight-crossing included', () => {
    expect(windowsOverlap(w('13:00', '14:00'), w('13:30', '15:00'))).toBe(true);
    expect(windowsOverlap(w('13:00', '14:00'), w('14:00', '15:00'))).toBe(false); // touching
    expect(windowsOverlap(w('13:00', '14:00'), w('15:00', '16:00'))).toBe(false);
    expect(windowsOverlap(w('22:00', '06:00'), w('05:00', '07:00'))).toBe(true);
    expect(windowsOverlap(w('22:00', '06:00'), w('12:00', '13:00'))).toBe(false);
    expect(windowsOverlap(w('05:00', '05:00'), w('04:00', '06:00'))).toBe(false);
  });
});

describe('mergeWindows', () => {
  it('leaves disjoint windows alone', () => {
    expect(mergeWindows([w('05:00', '05:30'), w('13:00', '13:30')])).toEqual([
      w('05:00', '05:30'),
      w('13:00', '13:30'),
    ]);
  });

  it('merges overlapping windows into one', () => {
    expect(mergeWindows([w('19:45', '20:45'), w('20:05', '21:05')])).toEqual([w('19:45', '21:05')]);
  });

  it('merges abutting windows (no gap means no second monitor)', () => {
    expect(mergeWindows([w('13:00', '13:30'), w('13:30', '14:00')])).toEqual([w('13:00', '14:00')]);
  });

  it('drops zero-length windows', () => {
    expect(mergeWindows([w('05:00', '05:00'), w('13:00', '13:30')])).toEqual([w('13:00', '13:30')]);
  });

  it('folds a window that spills past midnight into one starting after it', () => {
    expect(mergeWindows([w('23:30', '00:45'), w('00:30', '01:15')])).toEqual([w('23:30', '01:15')]);
  });

  it('clamps a union that would cover the whole day', () => {
    const merged = mergeWindows([w('00:00', '12:00'), w('11:00', '23:59'), w('23:00', '00:30')]);
    expect(merged).toHaveLength(1);
    expect(windowDurationMinutes(merged[0])).toBe(1439);
  });
});
