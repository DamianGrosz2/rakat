/**
 * Menses mode — the days on which the five daily prayers are lifted.
 *
 * Pure. No React, no React Native, no Expo (see AGENTS.md): this runs under
 * plain vitest, and the persistence edge lives in `@/store/tracker`.
 *
 * ## The two rulings encoded here
 *
 * 1. **The prayers are lifted, not postponed.** Obligatory prayers missed during
 *    menses are NOT made up afterwards — unlike the fasts of Ramadan, which are.
 *    So an excluded day contributes exactly zero to qada'. `@/tracker/qada`
 *    skips these days; the test `excluded days contribute zero qada'` in
 *    `menses.test.ts` is what keeps it that way.
 * 2. **An excluded day is invisible, never a failure.** It is not a broken day,
 *    not a gap, not a zero. `daysConsistent` skips it rather than counting it
 *    against the user, and the lock writes no schedules at all for it
 *    (`LockConfig.excludedDays`). The tracker reads as consistency, never as
 *    debt — DESIGN.md.
 *
 * Both are religiously consequential and are listed in `REVIEW.md` for the
 * Muslim reviewer. Do not change either without sign-off.
 */

import { dayKey, daysBetween } from '@/lock/window';

/**
 * One period, as local `YYYY-MM-DD` keys.
 *
 * Dates rather than timestamps because this is a calendar-day question: a
 * period that starts at 23:50 excludes that whole day, and comparing date keys
 * as strings is both correct and DST-proof.
 */
export interface Period {
  readonly start: string;
  /** Inclusive last day. `null` while the period is still going. */
  readonly end: string | null;
}

export interface MensesState {
  /** Newest first. At most one may be open (`end === null`). */
  readonly periods: readonly Period[];
}

export const EMPTY_MENSES: MensesState = { periods: [] };

const keyOf = (day: Date | string): string => (typeof day === 'string' ? day : dayKey(day));

/** The period that is still going, or `null`. */
export function currentPeriod(state: MensesState): Period | null {
  return state.periods.find((p) => p.end === null) ?? null;
}

/** Idempotent: starting a period while one is already open changes nothing. */
export function startPeriod(state: MensesState, on: Date | string = new Date()): MensesState {
  if (currentPeriod(state)) return state;
  return { periods: [{ start: keyOf(on), end: null }, ...state.periods] };
}

/**
 * Close the open period. A no-op when none is open, and an end before the start
 * is clamped to the start — a one-day period, which is what the user meant.
 */
export function endPeriod(state: MensesState, on: Date | string = new Date()): MensesState {
  const open = currentPeriod(state);
  if (!open) return state;
  const end = keyOf(on);
  return {
    periods: state.periods.map((p) =>
      p === open ? { start: p.start, end: end < p.start ? p.start : end } : p,
    ),
  };
}

/**
 * Whether the prayers were lifted on this day.
 *
 * An OPEN period covers `start .. today` and no further. Tomorrow has not
 * happened, so nothing can yet be said about it — and saying it would be a
 * claim about the user's body that the app is in no position to make.
 */
export function isExcluded(
  state: MensesState,
  day: Date | string,
  today: Date | string = new Date(),
): boolean {
  const key = keyOf(day);
  const todayKey = keyOf(today);
  return state.periods.some(
    (p) => key >= p.start && key <= (p.end ?? todayKey),
  );
}

/**
 * The `YYYY-MM-DD` keys to hand to `LockConfig.excludedDays` for a horizon of
 * `days` days starting at `from`. Unique and sorted; overlapping periods each
 * contribute their days once.
 *
 * ### Why this is not just `isExcluded` over the horizon
 *
 * While a period is OPEN the whole horizon is excluded, not only today. The
 * lock writes DeviceActivity schedules up to four days ahead and they fire
 * whether or not the app is ever opened — so scheduling tomorrow's Fajr shield
 * for someone who is still menstruating would shield her at a time no prayer is
 * due from her, with no way to stop it from inside the app. The horizon is
 * rewritten on every foreground, so the cost of being wrong the other way is
 * only that the lock resumes a day late. Between "shields her when she is
 * exempt" and "resumes a day late", the second is obviously right.
 */
export function excludedKeys(
  state: MensesState,
  from: Date = new Date(),
  days = 5,
  today: Date = from,
): string[] {
  const open = currentPeriod(state);
  const keys = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let i = 0; i < Math.max(0, days); i++) {
    const key = dayKey(cursor);
    // `open` covers the rest of the horizon — see the note above.
    if (open !== null && key >= open.start) keys.add(key);
    else if (isExcluded(state, key, today)) keys.add(key);
    cursor.setDate(cursor.getDate() + 1);
  }

  return [...keys].sort();
}

/** Whole days a period covers, inclusive of its first day. Never below 1. */
export function periodDayCount(period: Period, today: Date | string = new Date()): number {
  return Math.max(1, daysBetween(period.start, period.end ?? keyOf(today)) + 1);
}
