/**
 * "N days consistent" — the one derived number the home screen shows.
 *
 * Moved out of `@/store/tracker` so it can be unit-tested: the store imports
 * `expo-sqlite/kv-store` and cannot run under vitest, and this function now has
 * a rule in it worth testing (the menses skip).
 */

import type { TrackerState } from '@/lock/prayed';
import { dayKey } from '@/lock/window';
import { PRAYER_NAMES } from '@/prayer/methods';
import { EMPTY_MENSES, isExcluded, type MensesState } from '@/tracker/menses';

/**
 * Days in the last 30 on which all five prayers were marked.
 *
 * Deliberately NOT a consecutive streak. A streak has a reset, and a reset is
 * the "you broke it" moment the product rule forbids — the tracker reads as
 * consistency, never as debt. A rolling count moves gently in both directions
 * and never accuses anyone of anything. It is also the honest number: it says
 * how the last month actually went.
 *
 * **Menses days are skipped, not failed.** A day on which the prayers were
 * lifted is not a day the user fell short, so it leaves the window entirely: a
 * 30-day window holding 6 excluded days is a judgement about the other 24. The
 * alternative — counting them as incomplete — would quietly punish the user for
 * a ruling that exempts her, which is exactly the thing this product does not
 * do.
 *
 * DESIGN.md renders this as "N days consistent".
 */
export function daysConsistent(
  state: TrackerState,
  menses: MensesState = EMPTY_MENSES,
  today = new Date(),
  window = 30,
): number {
  let count = 0;
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (let i = 0; i < window; i++) {
    const key = dayKey(day);
    if (!isExcluded(menses, key, today)) {
      // Direct key lookup, not `marksForDay`: marks are already keyed
      // `${dateKey}:${prayer}`, so this is O(5) instead of O(every mark ever).
      if (PRAYER_NAMES.every((p) => state.marks[`${key}:${p}`])) count++;
    }
    day.setDate(day.getDate() - 1);
  }

  return count;
}
