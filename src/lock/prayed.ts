/**
 * The "I prayed" state transition, as a pure function.
 *
 * The shield cannot deep-link or show live data. All it can do is write a flag
 * into the App Group: a prayer key plus a timestamp. The app reads that flag on
 * next open, folds it into the tracker with `prayed()`, and clears it.
 *
 * ## The product rule, encoded here
 *
 * The tracker reads as CONSISTENCY, never as debt. Every number in
 * `TrackerState` only ever goes UP. There is no `missed` counter, no owed
 * prayers, no streak that breaks — a prayer that was never marked simply never
 * appears. `late` is not a penalty either: it counts prayers that WERE prayed,
 * just outside the window. Do not add a decrementing or negative field here.
 */

import {
  type PrayerWindow,
  dayKey,
  windowDurationMinutes,
} from './window';

/** Exactly what the ShieldAction writes into the App Group. */
export interface PrayedFlag {
  /** Prayer key, e.g. "fajr". */
  readonly prayer: string;
  /** Epoch milliseconds. */
  readonly at: number;
}

export interface PrayerMark {
  readonly prayer: string;
  /** Local `YYYY-MM-DD` of the prayer, NOT of the tap — see `prayed()`. */
  readonly dateKey: string;
  readonly at: number;
  readonly onTime: boolean;
}

export interface TrackerState {
  /** Count-up totals. Monotonically non-decreasing, always >= 0. */
  readonly totalPrayed: number;
  readonly onTime: number;
  readonly late: number;
  /** Distinct days with at least one prayer marked. Also count-up. */
  readonly daysActive: number;
  readonly lastDateKey: string | null;
  /** Keyed `${dateKey}:${prayer}`. Makes the fold idempotent. */
  readonly marks: Readonly<Record<string, PrayerMark>>;
}

export const EMPTY_TRACKER: TrackerState = {
  totalPrayed: 0,
  onTime: 0,
  late: 0,
  daysActive: 0,
  lastDateKey: null,
  marks: {},
};

export interface PrayedInput {
  readonly flag: PrayedFlag;
  /** The lock window for this prayer. */
  readonly window: PrayerWindow;
  /** The wall-clock moment the window opened (the adhan). */
  readonly windowStart: Date;
}

export interface PrayedResult {
  readonly state: TrackerState;
  /** Whether the app should tear the shield down for this prayer. */
  readonly clearShield: boolean;
  /**
   * The mark now on record — newly added, or the pre-existing one when the same
   * flag is replayed. `null` only when the flag was rejected as malformed.
   */
  readonly mark: PrayerMark | null;
}

/**
 * Fold an App-Group "I prayed" flag into the tracker.
 *
 * Idempotent: the flag lives in the App Group until the app clears it, so the
 * same payload can legitimately arrive twice. A replay returns the unchanged
 * state and still clears the shield.
 *
 * On-time vs late is decided on ABSOLUTE time (`windowStart` + the window's
 * duration), not on minute-of-day: a tap at 00:10 against a 23:45 Isha window
 * is on time, while a tap a full day later at the same clock minute is late.
 * The prayer is filed under `windowStart`'s day for the same reason — a
 * midnight-crossing Isha belongs to the day it was called, not the day the user
 * happened to tap.
 */
export function prayed(state: TrackerState, input: PrayedInput): PrayedResult {
  const { flag, window, windowStart } = input;

  // Trust boundary: this payload crosses from an App Group written by a
  // separate extension process. Never fold garbage into persisted state.
  const prayer = typeof flag?.prayer === 'string' ? flag.prayer.trim().toLowerCase() : '';
  const at = flag?.at;
  if (!prayer || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) {
    return { state, clearShield: false, mark: null };
  }

  const key = `${dayKey(windowStart)}:${prayer}`;
  const existing = state.marks[key];
  if (existing) return { state, clearShield: true, mark: existing };

  const opened = windowStart.getTime();
  const closed = opened + windowDurationMinutes(window) * 60_000;
  const mark: PrayerMark = {
    prayer,
    dateKey: dayKey(windowStart),
    at,
    // Half-open, matching `containsMinute`: a tap at the closing minute is late.
    onTime: at >= opened && at < closed,
  };

  return {
    state: {
      totalPrayed: state.totalPrayed + 1,
      onTime: state.onTime + (mark.onTime ? 1 : 0),
      late: state.late + (mark.onTime ? 0 : 1),
      daysActive: state.daysActive + (hasDay(state.marks, mark.dateKey) ? 0 : 1),
      lastDateKey: laterKey(state.lastDateKey, mark.dateKey),
      marks: { ...state.marks, [key]: mark },
    },
    clearShield: true,
    mark,
  };
}

/** All marks for one local day, chronological. For the day view. */
export function marksForDay(state: TrackerState, date: Date | string): PrayerMark[] {
  const key = typeof date === 'string' ? date : dayKey(date);
  return Object.values(state.marks)
    .filter((mark) => mark.dateKey === key)
    .sort((a, b) => a.at - b.at);
}

// ponytail: O(n) over every mark ever, on a path that runs once per prayer.
// Swap in a per-day index if the mark log ever stops being pruned.
function hasDay(marks: Readonly<Record<string, PrayerMark>>, dateKey: string): boolean {
  return Object.values(marks).some((mark) => mark.dateKey === dateKey);
}

function laterKey(a: string | null, b: string): string {
  return a === null || b > a ? b : a;
}
