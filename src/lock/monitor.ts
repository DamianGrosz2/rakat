/**
 * Turns a `SchedulePlan` into the actual DeviceActivity monitors to register.
 *
 * Pure — no `react-native-device-activity` import — so the budget maths runs
 * under vitest in node. `startMonitoring` is called from `engine.ts`.
 *
 * ## Why this layer exists at all
 *
 * `planLockSchedules` collapses identical windows across days and caps the
 * result at 20, which is the right model for the Swift original this was ported
 * from. But **DeviceActivity does not have a "these weekdays" schedule.** A
 * `DeviceActivitySchedule` whose `intervalStart` is `{hour, minute}` with
 * `repeats: true` fires EVERY day; restricting it to a weekday means putting
 * `weekday` into the components, which makes it repeat *weekly*.
 *
 * So one collapsed window covering three weekdays costs **three** monitors, not
 * one — and a plan that looks like 20 under the collapsed count can be 40 in
 * reality. Registering past the cap fails silently, which is the worst kind of
 * failure: the lock simply does not fire and nothing says so.
 *
 * This module therefore expands to the real (window x weekday) monitor list and
 * applies the cap where it actually bites, with the same priority rule as the
 * planner: the furthest-out day is the cheapest to lose, because the plan is
 * rewritten on every app open.
 */

import { MAX_MONITORS, type LockSchedule, type SchedulePlan } from './schedule';

/** Apple's `weekday`: 1 = Sunday … 7 = Saturday. Ours is Monday-first 0..6. */
export function toAppleWeekday(mondayFirstIndex: number): number {
  // Mon(0)->2, Tue(1)->3 … Sat(5)->7, Sun(6)->1
  return mondayFirstIndex === 6 ? 1 : mondayFirstIndex + 2;
}

export type MonitorDateComponents = {
  hour: number;
  minute: number;
  weekday: number;
};

export type PlannedMonitor = {
  /**
   * Stable across refreshes: same window + same weekday = same name, so
   * re-registering replaces rather than duplicates.
   */
  readonly activityName: string;
  readonly intervalStart: MonitorDateComponents;
  readonly intervalEnd: MonitorDateComponents;
  /** Always true — a weekday-qualified schedule repeats weekly. */
  readonly repeats: true;
  /** Day offset from `today` that produced this monitor. Used for the cap. */
  readonly dayIndex: number;
  readonly prayers: string[];
};

export type MonitorPlan = {
  readonly monitors: readonly PlannedMonitor[];
  /** Monitors that did not fit under the cap, furthest-out first. */
  readonly dropped: readonly PlannedMonitor[];
};

/**
 * A window that crosses midnight ends on the FOLLOWING weekday. A late Isha
 * lock running 23:45–00:15 must end on Tuesday if it started on Monday, or the
 * interval is 23h 30m long instead of 30m.
 */
function endWeekday(startWeekday: number, crossesMidnight: boolean): number {
  if (!crossesMidnight) return startWeekday;
  return startWeekday === 7 ? 1 : startWeekday + 1;
}

export function toMonitors(plan: SchedulePlan, limit: number = MAX_MONITORS): MonitorPlan {
  const expanded: PlannedMonitor[] = [];

  for (const schedule of plan.schedules) {
    schedule.weekdays.forEach((weekday, i) => {
      const apple = toAppleWeekday(weekday);
      const crosses = schedule.end.hour * 60 + schedule.end.minute
        <= schedule.start.hour * 60 + schedule.start.minute;
      expanded.push({
        activityName: `rakat.${schedule.id}.w${apple}`,
        intervalStart: { hour: schedule.start.hour, minute: schedule.start.minute, weekday: apple },
        intervalEnd: {
          hour: schedule.end.hour,
          minute: schedule.end.minute,
          weekday: endWeekday(apple, crosses),
        },
        repeats: true,
        dayIndex: schedule.dayIndices[i] ?? schedule.dayIndices[0] ?? 0,
        prayers: schedule.prayers,
      });
    });
  }

  // Soonest first, so the cap always keeps today's locks.
  expanded.sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      a.intervalStart.hour * 60 + a.intervalStart.minute -
        (b.intervalStart.hour * 60 + b.intervalStart.minute),
  );

  return {
    monitors: expanded.slice(0, Math.max(0, limit)),
    dropped: expanded.slice(Math.max(0, limit)),
  };
}

/** Names currently registered that the new plan no longer wants. */
export function staleActivityNames(
  plan: MonitorPlan,
  registered: readonly string[],
): string[] {
  const wanted = new Set(plan.monitors.map((m) => m.activityName));
  return registered.filter((name) => name.startsWith('rakat.') && !wanted.has(name));
}

export type { LockSchedule };
