/**
 * Pure window maths for the Salah Lock.
 *
 * Everything in here is MINUTES FROM MIDNIGHT (0..1439), never a `Date`.
 * A `Date` carries a timezone and a DST offset; a DeviceActivity schedule is a
 * repeating *wall-clock* interval. Doing the arithmetic in minute-of-day is what
 * makes a midnight-crossing window (a late Isha lock running past 00:00) both
 * correct and testable. Dates are converted at the edges only — that is what
 * `minuteOfDay` / `toWallClock` / `dayKey` are for.
 *
 * Ported from noreeels' `FocusScheduleRule.swift`: `FocusWindow`,
 * `isZeroLength`, `windowsOverlap` and the `(end - start + 1440) % 1440`
 * duration rule. The bypass/emergency-pass/hardcore/friend-approval policy from
 * that file is deliberately NOT ported — it is deleted logic for this app.
 */

export const MINUTES_PER_DAY = 1440;

/**
 * Apple's DeviceActivity floor. `startMonitoring` rejects an interval shorter
 * than 15 minutes with `intervalTooShort`, and the schedule is then SILENTLY
 * never enforced — it still eats one of the 20 monitor slots while blocking
 * nothing. A sub-15-minute window must be rejected here, not handed to the
 * daemon to drop on the floor.
 */
export const MINIMUM_WINDOW_MINUTES = 15;

/** Minutes since local midnight, 0..1439. */
export type MinuteOfDay = number;

/** A start/end time-of-day window. Which days it applies to lives elsewhere. */
export interface PrayerWindow {
  readonly start: MinuteOfDay;
  readonly end: MinuteOfDay;
}

/** Wall-clock pair for the native bridge (DeviceActivitySchedule components). */
export interface WallClock {
  readonly hour: number;
  readonly minute: number;
}

// MARK: - Edge conversions (the only places a Date is allowed)

/** Local minute-of-day for a `Date`. */
export function minuteOfDay(date: Date): MinuteOfDay {
  return date.getHours() * 60 + date.getMinutes();
}

/** Local calendar day key, `YYYY-MM-DD`. Used to key days and excluded days. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whole calendar days between two `dayKey`s. Parsed as UTC midnights so a DST
 * transition inside the range cannot round the difference to 0.99 of a day.
 */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Monday-first weekday index, 0 = Mon … 6 = Sun. Matches the Swift original. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function toWallClock(minute: MinuteOfDay): WallClock {
  const m = wrapMinute(minute);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

/** `"05:30"` — zero padded, 24h. */
export function formatMinute(minute: MinuteOfDay): string {
  const { hour, minute: min } = toWallClock(minute);
  return `${`${hour}`.padStart(2, '0')}:${`${min}`.padStart(2, '0')}`;
}

// MARK: - Window construction

/** Fold any minute count (negative included) into 0..1439. */
export function wrapMinute(minute: number): MinuteOfDay {
  const rounded = Math.round(minute);
  return ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function makeWindow(start: number, end: number): PrayerWindow {
  return { start: wrapMinute(start), end: wrapMinute(end) };
}

/** Window that opens at `start` and runs forward for `durationMinutes`. */
export function windowFrom(start: MinuteOfDay, durationMinutes: number): PrayerWindow {
  return makeWindow(start, start + Math.max(0, durationMinutes));
}

// MARK: - Guards (ported)

/** True when the window wraps past midnight (start > end), e.g. 23:45-00:30. */
export function crossesMidnight(window: PrayerWindow): boolean {
  return window.start > window.end;
}

/**
 * Length in minutes, `(end - start + 1440) % 1440`. A midnight-crossing window
 * wraps to its real duration (23:45-00:30 = 45); a zero-length window is 0.
 */
export function windowDurationMinutes(window: PrayerWindow): number {
  return (window.end - window.start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * True when a window has zero length (start == end). Such a window registers a
 * DeviceActivity activity that never enforces while still eating a monitor slot
 * — a silent fail-to-block. Never schedule one.
 */
export function isZeroLength(window: PrayerWindow): boolean {
  return window.start === window.end;
}

/** Non-zero but below Apple's 15-minute interval floor: also never schedulable. */
export function isTooShort(window: PrayerWindow): boolean {
  const duration = windowDurationMinutes(window);
  return duration > 0 && duration < MINIMUM_WINDOW_MINUTES;
}

/**
 * Half-open containment, `[start, end)`. Half-open so two back-to-back windows
 * (Dhuhr ending 13:30, Asr starting 13:30) do not both claim 13:30. Correct
 * across midnight: 23:45-00:30 contains 23:59 and 00:00, not 00:30.
 */
export function containsMinute(window: PrayerWindow, minute: MinuteOfDay): boolean {
  if (isZeroLength(window)) return false;
  const m = wrapMinute(minute);
  return crossesMidnight(window)
    ? m >= window.start || m < window.end
    : m >= window.start && m < window.end;
}

/**
 * True when two windows overlap, midnight-crossing included. Two half-open arcs
 * on a circle intersect iff one contains the other's start, so this is the whole
 * test — no endpoint-by-endpoint case analysis needed. Touching windows
 * (a.end == b.start) do NOT overlap, and a zero-length window — an empty arc —
 * overlaps nothing, not even a window it sits inside.
 */
export function windowsOverlap(a: PrayerWindow, b: PrayerWindow): boolean {
  if (isZeroLength(a) || isZeroLength(b)) return false;
  return containsMinute(a, b.start) || containsMinute(b, a.start);
}

// MARK: - Identity + merging

/** `"05:30-06:00"`. THE dedup key: identical windows share one monitor. */
export function windowKey(window: PrayerWindow): string {
  return `${formatMinute(window.start)}-${formatMinute(window.end)}`;
}

/**
 * Merge overlapping or abutting windows into the fewest windows that cover the
 * same minutes. Zero-length windows are dropped (they enforce nothing).
 *
 * Overlapping windows are MERGED rather than rejected: two monitors covering
 * overlapping minutes waste a slot out of the 20-cap budget and shield exactly
 * the same thing as one.
 *
 * The sweep runs on absolute minutes (`start + duration`, so a midnight-crosser
 * simply spills past 1440), then folds the single wrap-around case at the end.
 */
export function mergeWindows(windows: readonly PrayerWindow[]): PrayerWindow[] {
  const spans = windows
    .filter((w) => !isZeroLength(w))
    .map((w) => ({ from: w.start, to: w.start + windowDurationMinutes(w) }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: { from: number; to: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) {
      last.to = Math.max(last.to, span.to);
      continue;
    }
    merged.push({ ...span });
  }

  // A day is a circle, the sweep is a line: the last span may spill past
  // midnight into the first one. Fold that one case.
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    const first = merged[0];
    if (last.to - MINUTES_PER_DAY >= first.from) {
      first.from = last.from - MINUTES_PER_DAY;
      first.to = Math.max(first.to, last.to - MINUTES_PER_DAY);
      merged.pop();
    }
  }

  return merged.map((span) => {
    // A union covering the whole day cannot be expressed as a repeating
    // interval (start == end reads as zero-length to DeviceActivity), so clamp
    // to 23:59 long. ponytail: 1-minute gap at the seam; only reachable from an
    // absurd config, revisit if a real one produces it.
    const duration = Math.min(span.to - span.from, MINUTES_PER_DAY - 1);
    return makeWindow(span.from, span.from + duration);
  });
}
