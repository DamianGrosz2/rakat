import { describe, expect, it } from 'vitest';

import { EMPTY_TRACKER, type PrayerMark, type TrackerState } from '@/lock/prayed';
import { PRAYER_NAMES } from '@/prayer/methods';
import { daysConsistent } from './consistency';
import {
  EMPTY_MENSES,
  currentPeriod,
  endPeriod,
  excludedKeys,
  isExcluded,
  periodDayCount,
  startPeriod,
  type MensesState,
} from './menses';
import { EMPTY_QADA, owedByPrayer, qadaSummary } from './qada';

const TODAY = new Date(2026, 8, 11); // Friday 2026-09-11
const day = (n: number) => new Date(2026, 8, n);

/** A tracker where all five were marked on each of the given day keys. */
function allFiveOn(keys: string[]): TrackerState {
  const marks: Record<string, PrayerMark> = {};
  for (const dateKey of keys) {
    for (const prayer of PRAYER_NAMES) {
      marks[`${dateKey}:${prayer}`] = { prayer, dateKey, at: 1, onTime: true };
    }
  }
  return { ...EMPTY_TRACKER, marks };
}

const keysBack = (from: Date, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - i);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
  });

describe('periods', () => {
  it('an open period excludes today and not tomorrow', () => {
    const state = startPeriod(EMPTY_MENSES, day(9));

    expect(isExcluded(state, day(9), TODAY)).toBe(true);
    expect(isExcluded(state, day(10), TODAY)).toBe(true);
    expect(isExcluded(state, TODAY, TODAY)).toBe(true);
    // Tomorrow has not happened. The app does not get to claim it.
    expect(isExcluded(state, day(12), TODAY)).toBe(false);
    expect(isExcluded(state, day(8), TODAY)).toBe(false);

    expect(currentPeriod(state)?.start).toBe('2026-09-09');
    expect(periodDayCount(currentPeriod(state)!, TODAY)).toBe(3);
  });

  it('a closed period excludes exactly its days, inclusive of both ends', () => {
    const state = endPeriod(startPeriod(EMPTY_MENSES, day(5)), day(9));

    expect(isExcluded(state, day(4), TODAY)).toBe(false);
    for (const d of [5, 6, 7, 8, 9]) expect(isExcluded(state, day(d), TODAY)).toBe(true);
    expect(isExcluded(state, day(10), TODAY)).toBe(false);

    expect(currentPeriod(state)).toBeNull();
    expect(periodDayCount(state.periods[0])).toBe(5);
  });

  it('starting twice does not open a second period, and ending twice is a no-op', () => {
    const open = startPeriod(EMPTY_MENSES, day(9));
    expect(startPeriod(open, day(10))).toBe(open);

    const closed = endPeriod(open, day(10));
    expect(endPeriod(closed, day(11))).toBe(closed);
    expect(closed.periods).toHaveLength(1);
  });

  it('clamps an end before the start to a single day', () => {
    const state = endPeriod(startPeriod(EMPTY_MENSES, day(9)), day(7));
    expect(state.periods[0]).toEqual({ start: '2026-09-09', end: '2026-09-09' });
    expect(periodDayCount(state.periods[0])).toBe(1);
  });

  it('overlapping periods do not double-count their days', () => {
    const state: MensesState = {
      periods: [
        { start: '2026-09-07', end: '2026-09-10' },
        { start: '2026-09-05', end: '2026-09-08' },
      ],
    };

    const keys = excludedKeys(state, day(5), 8, TODAY);
    expect(keys).toEqual([
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('excludedKeys — what the lock is told', () => {
  it('covers the whole horizon while a period is open', () => {
    // The lock writes DeviceActivity schedules days ahead and they fire without
    // the app. Scheduling tomorrow's shield for someone still menstruating
    // would shield her when no prayer is due from her, with no way out.
    const state = startPeriod(EMPTY_MENSES, day(10));

    expect(excludedKeys(state, TODAY, 5, TODAY)).toEqual([
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  it('stops at the last day once the period is closed', () => {
    const state = endPeriod(startPeriod(EMPTY_MENSES, day(9)), day(11));
    expect(excludedKeys(state, TODAY, 5, TODAY)).toEqual(['2026-09-11']);
  });

  it('is empty when there has never been a period', () => {
    expect(excludedKeys(EMPTY_MENSES, TODAY, 5, TODAY)).toEqual([]);
  });
});

describe('daysConsistent', () => {
  it('skips excluded days rather than failing them', () => {
    // 24 complete days, then 6 days on which the prayers were lifted.
    const complete = allFiveOn(keysBack(day(5), 24));
    const menses: MensesState = { periods: [{ start: '2026-09-06', end: '2026-09-11' }] };

    // Without menses mode those 6 days read as 6 days the user fell short.
    expect(daysConsistent(complete, EMPTY_MENSES, TODAY)).toBe(24);
    // With it they leave the window entirely — the judgement is about the 24.
    expect(daysConsistent(complete, menses, TODAY)).toBe(24);
  });

  it('does not credit an excluded day either — it is invisible, not a free pass', () => {
    const menses: MensesState = { periods: [{ start: '2026-09-06', end: '2026-09-11' }] };
    expect(daysConsistent(EMPTY_TRACKER, menses, TODAY)).toBe(0);
  });

  it('still counts the days around a period', () => {
    const state = allFiveOn(['2026-09-11', '2026-09-05', '2026-09-04']);
    const menses: MensesState = { periods: [{ start: '2026-09-06', end: '2026-09-10' }] };
    expect(daysConsistent(state, menses, TODAY)).toBe(3);
  });
});

describe('menses days are never owed as qada', () => {
  // Settled ruling: obligatory prayers missed during menses are lifted, not
  // postponed — unlike the fasts of Ramadan, which ARE made up. If this test
  // ever goes red the app has started asking for prayers nobody owes.
  const startedOn = '2026-08-01';
  const qada = { ...EMPTY_QADA, startedOn };

  it('contributes zero for every excluded day', () => {
    const menses: MensesState = { periods: [{ start: '2026-09-04', end: '2026-09-10' }] };
    const input = { qada, tracker: EMPTY_TRACKER, today: TODAY };

    const withoutMenses = qadaSummary(input).owed;
    const withMenses = qadaSummary({ ...input, menses }).owed;

    // Seven lifted days × five prayers, and not one of them owed.
    expect(withoutMenses - withMenses).toBe(35);
    for (const p of PRAYER_NAMES) {
      expect(owedByPrayer({ ...input, menses })[p]).toBe(withoutMenses / 5 - 7);
    }
  });

  it('owes nothing at all when the whole span was excluded', () => {
    const menses: MensesState = { periods: [{ start: startedOn, end: '2026-09-11' }] };
    expect(qadaSummary({ qada, tracker: EMPTY_TRACKER, menses, today: TODAY }).owed).toBe(0);
  });
});
