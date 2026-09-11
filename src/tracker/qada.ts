/**
 * Qada' — the make-up prayer tracker.
 *
 * Pure. No React, no React Native, no Expo (AGENTS.md); the persistence edge is
 * `@/store/tracker`.
 *
 * ## The product rule, and why this file is where it gets broken
 *
 * The tracker reads as consistency, never as debt. Qada' is the easiest place
 * in the app to get that wrong, because the domain word for it really is
 * "owed". Three guards:
 *
 * 1. **Nothing is owed on install.** `startedOn` is stamped the first time the
 *    app stores this state, and the scan runs strictly AFTER it. A user who
 *    installs today owes nothing today, nothing tomorrow, and nothing for the
 *    day they installed — that day was already half gone when they arrived.
 *    Inventing a backlog on install is the single worst thing this feature
 *    could do, so it is the first thing the tests check.
 * 2. **Menses days are never owed.** Obligatory prayers missed during menses
 *    are lifted, not postponed — unlike the fasts of Ramadan. See
 *    `@/tracker/menses`.
 * 3. **`madeUp` only ever goes up** and `owed` clamps at zero. There is no
 *    field here that can go negative and no counter that resets.
 *
 * The UI says "left" and "made up"; the word debt appears nowhere a user can
 * see it.
 */

import type { TrackerState } from '@/lock/prayed';
import { dayKey } from '@/lock/window';
import { PRAYER_NAMES, type PrayerName } from '@/prayer/methods';
import { EMPTY_MENSES, isExcluded, type MensesState } from '@/tracker/menses';

export type PerPrayer = Readonly<Record<PrayerName, number>>;

export interface QadaState {
  /**
   * Local `YYYY-MM-DD` the app started watching from. Days on or before it are
   * never counted — see guard 1 above. `null` only before the first store.
   */
  readonly startedOn: string | null;
  /**
   * Signed per-prayer adjustment. Positive is a backlog the user knows about
   * from before the app; NEGATIVE is how she says "I prayed those, you just
   * didn't see it" — the scan below can only observe taps, so it must be
   * correctable downwards or it would argue with the user about her own life.
   */
  readonly adjust: Readonly<Record<string, number>>;
  /** Count-up, per prayer. Only ever increases. */
  readonly madeUp: Readonly<Record<string, number>>;
  /** Chosen pace, prayers per week. Persisted: a plan that forgets is no plan. */
  readonly perWeek: number;
}

export const EMPTY_QADA: QadaState = { startedOn: null, adjust: {}, madeUp: {}, perWeek: 7 };

/** Pace options. One a day is the default — it finishes, and it is doable. */
export const PACES = [
  { perWeek: 5, label: 'Five a week' },
  { perWeek: 7, label: 'One a day' },
  { perWeek: 14, label: 'Two a day' },
] as const;

/**
 * A scan this long means the stored `startedOn` is corrupt, not that the user
 * has been away for a decade.
 * ponytail: a flat cap, not validation. Raise it if someone ever needs it.
 */
const MAX_SCAN_DAYS = 366 * 5;

export interface QadaInput {
  readonly qada: QadaState;
  readonly tracker: TrackerState;
  readonly menses?: MensesState;
  readonly today?: Date;
}

/** Stamp the start day the first time this state is stored. Idempotent. */
export function beginOn(state: QadaState, today: Date | string = new Date()): QadaState {
  if (state.startedOn) return state;
  return { ...state, startedOn: typeof today === 'string' ? today : dayKey(today) };
}

/**
 * Prayers with no mark, on complete days since `startedOn`, menses days skipped.
 *
 * Today is excluded whole: the day is still running and its prayers are not
 * missed, they are upcoming. So is `startedOn` itself.
 */
export function missedByPrayer(input: QadaInput): PerPrayer {
  const { qada, tracker, menses = EMPTY_MENSES, today = new Date() } = input;
  const counts = blank();
  if (!qada.startedOn) return counts;

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cursor.setDate(cursor.getDate() - 1); // yesterday: the last complete day

  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    const key = dayKey(cursor);
    if (key <= qada.startedOn) break;
    // A lifted day is not a missed day. It contributes zero, always.
    if (!isExcluded(menses, key, today)) {
      for (const p of PRAYER_NAMES) if (!tracker.marks[`${key}:${p}`]) counts[p]++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return counts;
}

/** What is left to make up, per prayer. Never negative. */
export function owedByPrayer(input: QadaInput): PerPrayer {
  const missed = missedByPrayer(input);
  const counts = blank();
  for (const p of PRAYER_NAMES) {
    counts[p] = Math.max(0, missed[p] + num(input.qada.adjust[p]) - num(input.qada.madeUp[p]));
  }
  return counts;
}

export interface QadaSummary {
  readonly owed: number;
  readonly madeUp: number;
  readonly byPrayer: PerPrayer;
  /** 0..1 toward finishing. 1 when there is nothing left. */
  readonly progress: number;
}

export function qadaSummary(input: QadaInput): QadaSummary {
  const byPrayer = owedByPrayer(input);
  const owed = total(byPrayer);
  const madeUp = PRAYER_NAMES.reduce((n, p) => n + num(input.qada.madeUp[p]), 0);
  return { owed, madeUp, byPrayer, progress: owed === 0 ? 1 : madeUp / (madeUp + owed) };
}

export interface QadaPlan extends QadaSummary {
  readonly perWeek: number;
  /** Days to the end at this pace. 0 when there is nothing left. */
  readonly days: number;
  /** `null` when nothing is owed — no date, because there is nothing to date. */
  readonly finish: Date | null;
  readonly done: boolean;
}

/**
 * The whole point of this screen: an end you can see.
 *
 * A backlog with no horizon is a debt; a backlog with a date on it is a plan.
 * Zero owed returns `done` with `finish: null` rather than "finishing today",
 * because a finish date for nothing is a number pretending to be news.
 */
export function qadaPlan(input: QadaInput): QadaPlan {
  const summary = qadaSummary(input);
  const perWeek = Math.max(1, Math.round(input.qada.perWeek || 7));
  if (summary.owed === 0) {
    return { ...summary, perWeek, days: 0, finish: null, done: true };
  }

  const days = Math.ceil((summary.owed * 7) / perWeek);
  const today = input.today ?? new Date();
  const finish = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return { ...summary, perWeek, days, finish, done: false };
}

/**
 * Record one prayer made up.
 *
 * Refuses when nothing is owed for that prayer, so `madeUp` cannot be inflated
 * past the backlog and then silently swallow a real one later.
 */
export function payBack(input: QadaInput, prayer: PrayerName): QadaState {
  if (owedByPrayer(input)[prayer] <= 0) return input.qada;
  const { qada } = input;
  return { ...qada, madeUp: { ...qada.madeUp, [prayer]: num(qada.madeUp[prayer]) + 1 } };
}

/** Enter (or walk back) a backlog by hand. See `adjust` above. */
export function adjustBacklog(state: QadaState, prayer: PrayerName, delta: number): QadaState {
  return { ...state, adjust: { ...state.adjust, [prayer]: num(state.adjust[prayer]) + delta } };
}

export function setPace(state: QadaState, perWeek: number): QadaState {
  return { ...state, perWeek: Math.max(1, Math.round(perWeek)) };
}

// Persisted JSON is a trust boundary: a missing or corrupt entry reads as 0,
// never as NaN leaking into every figure on the screen.
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function blank(): Record<PrayerName, number> {
  return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}

function total(counts: PerPrayer): number {
  return PRAYER_NAMES.reduce((n, p) => n + counts[p], 0);
}
