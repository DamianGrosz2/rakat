/**
 * Prayer times -> DeviceActivity schedules.
 *
 * Pure maths. No native calls, no React, no Expo. The bridge takes
 * `SchedulePlan.schedules` and writes one DeviceActivity monitor per entry.
 *
 * ## The two platform constraints that drive this whole file
 *
 * 1. **iOS allows at most 20 DeviceActivity monitors scheduled at once.**
 *    Five prayers x N days blows that budget fast, so schedules are written on a
 *    ROLLING WINDOW of at most 4 days and refreshed every time the app opens.
 *    `MAX_MONITORS` is a hard cap, not a hint: past 20, `startMonitoring` throws
 *    and you can lose the monitors you already had.
 *
 * 2. **A DeviceActivity schedule is a repeating wall-clock interval, so
 *    identical windows collapse into one monitor.** That collapse IS the
 *    budgeting trick — the same Fajr window on four days costs ONE monitor, not
 *    four. Do not "simplify" the collapse away; it is the only reason a 4-day
 *    plan fits at all. (Ported from `distinctEnabledWindows()` in noreeels'
 *    FocusScheduleRule.swift: "Each distinct window costs exactly one
 *    DeviceActivity activity (the 20-cap budget). Off days contribute nothing;
 *    same-window-every-day collapses to one.")
 */

import {
  MINUTES_PER_DAY,
  type PrayerWindow,
  type WallClock,
  containsMinute,
  dayKey,
  daysBetween,
  isTooShort,
  isZeroLength,
  mergeWindows,
  minuteOfDay,
  toWallClock,
  weekdayIndex,
  windowDurationMinutes,
  windowFrom,
  windowKey,
} from './window';

/** iOS hard limit on concurrently scheduled DeviceActivity monitors. */
export const MAX_MONITORS = 20;

/** Rolling horizon. Refreshed on every app open, so 4 days is plenty of runway. */
export const MAX_ROLLING_DAYS = 4;

/** Monday-first index of Friday, for Jumu'ah. */
const FRIDAY = 4;

// MARK: - Input

/** One prayer's adhan time. Kept deliberately dumb so this module stays
 *  decoupled from whatever engine produces the times. */
export interface PrayerTime {
  readonly name: string;
  readonly start: Date;
}

/** One calendar day's prayers, in chronological order. */
export interface DayPrayers {
  readonly date: Date;
  readonly prayers: readonly PrayerTime[];
}

/** How long a prayer's lock window runs. */
export type WindowLength =
  /** A flat N minutes from the adhan. */
  | { readonly kind: 'fixed'; readonly minutes: number }
  /** From the adhan until `leadOutMinutes` before the NEXT prayer. */
  | { readonly kind: 'untilNextPrayer'; readonly leadOutMinutes: number };

export interface JumuahConfig {
  readonly enabled: boolean;
  /** Which prayer Jumu'ah replaces on Friday. */
  readonly prayer: string;
  readonly length: WindowLength;
}

export interface LockConfig {
  /** Prayers that get a lock window. Anything not listed contributes nothing. */
  readonly lockedPrayers: readonly string[];
  readonly defaultLength: WindowLength;
  /** Per-prayer override, keyed by lowercased prayer name. */
  readonly perPrayer?: Readonly<Record<string, WindowLength>>;
  /** Friday Dhuhr runs longer than a weekday Dhuhr. */
  readonly jumuah?: JumuahConfig;
  /**
   * Local `YYYY-MM-DD` keys that write NO schedules at all — menses mode and
   * travel mode. The day contributes nothing, exactly like a disabled weekday
   * in the Swift original. It is not shortened, not shifted, not replaced.
   */
  readonly excludedDays?: readonly string[];
}

export const DEFAULT_LOCK_CONFIG: LockConfig = {
  lockedPrayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
  defaultLength: { kind: 'fixed', minutes: 30 },
  jumuah: {
    enabled: true,
    prayer: 'dhuhr',
    // Jumu'ah is khutbah + jama'ah, so it needs longer than a weekday Dhuhr.
    length: { kind: 'fixed', minutes: 90 },
  },
};

// MARK: - Output

/** One DeviceActivity monitor to write. */
export interface LockSchedule {
  /**
   * Derived from the window alone, so the same window keeps the same monitor
   * identity across refreshes and the bridge can replace rather than duplicate.
   */
  readonly id: string;
  readonly window: PrayerWindow;
  readonly start: WallClock;
  readonly end: WallClock;
  readonly durationMinutes: number;
  /** Day offsets from `today` this monitor covers, ascending. 0 = today. */
  readonly dayIndices: number[];
  /** Monday-first weekdays, parallel to `dayIndices`. What the bridge needs. */
  readonly weekdays: number[];
  /** Distinct prayer names that produced this window, first seen first. */
  readonly prayers: string[];
}

export type DropReason =
  /** Menses / travel: the whole day writes nothing. */
  | 'excludedDay'
  /** start == end: would register a monitor that never enforces. */
  | 'zeroLength'
  /** Below Apple's 15-minute floor: `startMonitoring` would reject it. */
  | 'tooShort'
  /** Cut to stay under the 20-monitor cap. */
  | 'monitorBudget';

export interface DroppedItem {
  readonly dayIndex: number;
  readonly dateKey: string;
  /** Absent when the whole day was dropped. */
  readonly prayer?: string;
  readonly reason: DropReason;
  readonly detail: string;
}

export interface SchedulePlan {
  readonly schedules: LockSchedule[];
  /** Everything that did NOT get a monitor, and why. Surface this in the UI. */
  readonly dropped: DroppedItem[];
}

export interface PlanOptions {
  /** Anchor of the rolling window. Day index 0 is this calendar day. */
  readonly today: Date;
  /** Prayer times per day. Days outside the rolling window are ignored. */
  readonly days: readonly DayPrayers[];
  readonly config?: LockConfig;
}

// MARK: - Planning

/**
 * Build the (at most 20) DeviceActivity monitors covering the next
 * `MAX_ROLLING_DAYS` days from `today`.
 *
 * ### Overflow priority, when the collapsed windows still exceed 20
 *
 * 1. Drop the FURTHEST-OUT day, whole, and re-collapse. Repeat while over cap.
 *    Rationale: the plan is rewritten on every app open, so the last day of the
 *    horizon is the cheapest thing to lose — it will be re-planned long before
 *    it arrives. Today's lock is the one that must not be lost.
 * 2. If a single day alone still exceeds 20 (only reachable with >20 distinct
 *    windows configured for one day), drop that day's LATEST-starting windows
 *    first, for the same reason: the soonest lock is the one most likely to be
 *    enforced before the next refresh.
 *
 * Both tiers are deterministic and reported in `plan.dropped`.
 */
export function planLockSchedules(options: PlanOptions): SchedulePlan {
  const config = options.config ?? DEFAULT_LOCK_CONFIG;
  const excluded = new Set(config.excludedDays ?? []);
  const locked = new Set(config.lockedPrayers.map((name) => name.toLowerCase()));
  const dropped: DroppedItem[] = [];

  // Index the input by offset from today. Days past the rolling window are kept
  // in the map but never planned: day 3's Isha still needs day 4's Fajr to know
  // where to end, so callers should supply one day more than the horizon.
  const todayKey = dayKey(options.today);
  const byIndex = new Map<number, DayPrayers>();
  for (const day of options.days) {
    const index = daysBetween(todayKey, dayKey(day.date));
    if (index < 0) continue;
    if (!byIndex.has(index)) byIndex.set(index, day);
  }

  const plans: DayPlan[] = [];
  const planned = [...byIndex.keys()].filter((i) => i < MAX_ROLLING_DAYS).sort((a, b) => a - b);
  for (const index of planned) {
    const day = byIndex.get(index)!;
    const key = dayKey(day.date);

    if (excluded.has(key)) {
      // Menses / travel. The day contributes nothing at all — no shortened
      // window, no shifted window. Other days are untouched.
      dropped.push({
        dayIndex: index,
        dateKey: key,
        reason: 'excludedDay',
        detail: 'day excluded (menses/travel): no schedules written',
      });
      continue;
    }

    plans.push(buildDayPlan(index, key, day, byIndex.get(index + 1), locked, config, dropped));
  }

  // Collapse identical windows across days, then enforce the cap.
  let kept = plans.filter((plan) => plan.entries.length > 0);
  let schedules = collapse(kept);

  while (schedules.length > MAX_MONITORS && kept.length > 1) {
    const gone = kept[kept.length - 1];
    kept = kept.slice(0, -1);
    dropped.push({
      dayIndex: gone.index,
      dateKey: gone.dateKey,
      reason: 'monitorBudget',
      detail: `over the ${MAX_MONITORS}-monitor cap: furthest-out day dropped, will be re-planned on next app open`,
    });
    schedules = collapse(kept);
  }

  if (schedules.length > MAX_MONITORS) {
    // Tier 2: one day on its own exceeds the budget. Keep the earliest windows.
    const byStart = [...schedules].sort((a, b) => a.window.start - b.window.start);
    const keep = new Set(byStart.slice(0, MAX_MONITORS).map((s) => s.id));
    for (const cut of byStart.slice(MAX_MONITORS)) {
      dropped.push({
        dayIndex: cut.dayIndices[0],
        dateKey: kept[0]?.dateKey ?? todayKey,
        prayer: cut.prayers.join('+'),
        reason: 'monitorBudget',
        detail: `over the ${MAX_MONITORS}-monitor cap within one day: latest windows dropped first`,
      });
    }
    schedules = schedules.filter((s) => keep.has(s.id));
  }

  return { schedules, dropped };
}

// MARK: - Internals

interface DayEntry {
  readonly window: PrayerWindow;
  readonly prayers: string[];
}

interface DayPlan {
  readonly index: number;
  readonly dateKey: string;
  readonly weekday: number;
  readonly entries: DayEntry[];
}

function buildDayPlan(
  index: number,
  key: string,
  day: DayPrayers,
  nextDay: DayPrayers | undefined,
  locked: ReadonlySet<string>,
  config: LockConfig,
  dropped: DroppedItem[],
): DayPlan {
  const weekday = weekdayIndex(day.date);
  const prayers = [...day.prayers];
  const candidates: { name: string; window: PrayerWindow }[] = [];

  for (let i = 0; i < prayers.length; i++) {
    const prayer = prayers[i];
    if (!locked.has(prayer.name.toLowerCase())) continue;

    // "Next prayer" is the next ADHAN, locked or not — the lock has to end
    // before the next call regardless of whether that one is shielded. For the
    // last prayer of the day that is tomorrow's Fajr, which is exactly how an
    // Isha window ends up crossing midnight.
    const next = prayers[i + 1]?.start ?? nextDay?.prayers[0]?.start;
    const window = windowFor(prayer, next, lengthFor(config, prayer.name, weekday));

    if (isZeroLength(window)) {
      dropped.push({
        dayIndex: index,
        dateKey: key,
        prayer: prayer.name,
        reason: 'zeroLength',
        detail: 'window has zero length: it would register a monitor that never enforces',
      });
      continue;
    }
    if (isTooShort(window)) {
      dropped.push({
        dayIndex: index,
        dateKey: key,
        prayer: prayer.name,
        reason: 'tooShort',
        detail: `window is under Apple's 15-minute DeviceActivity floor (${windowDurationMinutes(window)} min)`,
      });
      continue;
    }
    candidates.push({ name: prayer.name, window });
  }

  // Overlapping windows within a day are MERGED, not rejected: two monitors
  // over the same minutes cost two slots and shield the same thing as one.
  const merged = mergeWindows(candidates.map((c) => c.window));
  const entries: DayEntry[] = merged.map((window) => ({ window, prayers: [] }));
  for (const candidate of candidates) {
    const entry = entries.find((e) => containsMinute(e.window, candidate.window.start));
    entry?.prayers.push(candidate.name);
  }

  return { index, dateKey: key, weekday, entries };
}

/** Jumu'ah wins on Friday, then a per-prayer override, then the default. */
function lengthFor(config: LockConfig, name: string, weekday: number): WindowLength {
  const key = name.toLowerCase();
  const jumuah = config.jumuah;
  if (jumuah?.enabled && weekday === FRIDAY && jumuah.prayer.toLowerCase() === key) {
    return jumuah.length;
  }
  return config.perPrayer?.[key] ?? config.defaultLength;
}

function windowFor(prayer: PrayerTime, next: Date | undefined, length: WindowLength): PrayerWindow {
  const start = minuteOfDay(prayer.start);
  if (length.kind === 'fixed') return windowFrom(start, length.minutes);
  // No next adhan known (end of the supplied range) -> zero-length, which the
  // caller reports as a drop rather than silently guessing a duration.
  if (!next) return { start, end: start };
  // Always measure FORWARD from the adhan. Subtracting wall clocks instead
  // turns "lead-out longer than the gap" into a 23-hour window.
  const gap = (minuteOfDay(next) - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return windowFrom(start, gap - length.leadOutMinutes);
}

/**
 * The 20-cap budgeting trick: identical windows across days share ONE monitor.
 * First-occurrence order gives stable slot indices for activity naming.
 */
function collapse(plans: readonly DayPlan[]): LockSchedule[] {
  const order: string[] = [];
  const byKey = new Map<string, LockSchedule>();

  for (const plan of plans) {
    for (const entry of plan.entries) {
      const key = windowKey(entry.window);
      let schedule = byKey.get(key);
      if (!schedule) {
        schedule = {
          id: `salah-${key.replace(/[:]/g, '')}`,
          window: entry.window,
          start: toWallClock(entry.window.start),
          end: toWallClock(entry.window.end),
          durationMinutes: windowDurationMinutes(entry.window),
          dayIndices: [],
          weekdays: [],
          prayers: [],
        };
        byKey.set(key, schedule);
        order.push(key);
      }
      schedule.dayIndices.push(plan.index);
      schedule.weekdays.push(plan.weekday);
      for (const name of entry.prayers) {
        if (!schedule.prayers.includes(name)) schedule.prayers.push(name);
      }
    }
  }

  return order.map((key) => byKey.get(key)!);
}
