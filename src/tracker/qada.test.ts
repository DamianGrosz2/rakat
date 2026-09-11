import { describe, expect, it } from 'vitest';

import { EMPTY_TRACKER, type PrayerMark, type TrackerState } from '@/lock/prayed';
import { PRAYER_NAMES } from '@/prayer/methods';
import { EMPTY_MENSES, type MensesState } from './menses';
import {
  EMPTY_QADA,
  PACES,
  adjustBacklog,
  beginOn,
  missedByPrayer,
  owedByPrayer,
  payBack,
  qadaPlan,
  qadaSummary,
  setPace,
  type QadaState,
} from './qada';

const TODAY = new Date(2026, 8, 11); // Friday 2026-09-11
const day = (n: number) => new Date(2026, 8, n);
const startedOn = (key: string): QadaState => ({ ...EMPTY_QADA, startedOn: key });

function markedOn(keys: string[]): TrackerState {
  const marks: Record<string, PrayerMark> = {};
  for (const dateKey of keys) {
    for (const prayer of PRAYER_NAMES) {
      marks[`${dateKey}:${prayer}`] = { prayer, dateKey, at: 1, onTime: true };
    }
  }
  return { ...EMPTY_TRACKER, marks };
}

describe('a fresh install owes nothing', () => {
  it('owes nothing before the start day is even stamped', () => {
    expect(qadaSummary({ qada: EMPTY_QADA, tracker: EMPTY_TRACKER, today: TODAY }).owed).toBe(0);
  });

  it('owes nothing on the day of install, or the day after', () => {
    // The install day was already half gone when the user arrived, so it is
    // never counted; and today is still running, so it is never counted either.
    const qada = beginOn(EMPTY_QADA, TODAY);
    expect(qada.startedOn).toBe('2026-09-11');
    expect(qadaSummary({ qada, tracker: EMPTY_TRACKER, today: TODAY }).owed).toBe(0);
    expect(qadaSummary({ qada, tracker: EMPTY_TRACKER, today: day(12) }).owed).toBe(0);
  });

  it('only starts counting on the second complete day', () => {
    const qada = beginOn(EMPTY_QADA, day(11));
    // 13th: the 12th is the first day that both started and finished under us.
    expect(qadaSummary({ qada, tracker: EMPTY_TRACKER, today: day(13) }).owed).toBe(5);
  });

  it('never re-stamps the start day', () => {
    const qada = beginOn(EMPTY_QADA, TODAY);
    expect(beginOn(qada, day(20))).toBe(qada);
  });
});

describe('what is missed', () => {
  it('counts only unmarked prayers on complete days', () => {
    const input = { qada: startedOn('2026-09-05'), tracker: markedOn(['2026-09-08']), today: TODAY };
    // Complete days are the 6th..10th = 5 days; one of them fully marked.
    expect(qadaSummary(input).owed).toBe(20);
    expect(missedByPrayer(input).fajr).toBe(4);
  });

  it('never counts today, however little of it has been marked', () => {
    const input = { qada: startedOn('2026-09-10'), tracker: EMPTY_TRACKER, today: TODAY };
    expect(qadaSummary(input).owed).toBe(0);
  });

  it('does not add a menses day to the total', () => {
    const menses: MensesState = { periods: [{ start: '2026-09-07', end: '2026-09-09' }] };
    const base = { qada: startedOn('2026-09-01'), tracker: EMPTY_TRACKER, today: TODAY };

    expect(qadaSummary(base).owed).toBe(45); // 2nd..10th
    expect(qadaSummary({ ...base, menses }).owed).toBe(30); // minus three days
  });
});

describe('paying back', () => {
  const input = { qada: startedOn('2026-09-05'), tracker: EMPTY_TRACKER, menses: EMPTY_MENSES, today: TODAY };

  it('decrements owed and increments madeUp', () => {
    const before = qadaSummary(input);
    const qada = payBack(input, 'fajr');
    const after = qadaSummary({ ...input, qada });

    expect(after.owed).toBe(before.owed - 1);
    expect(after.madeUp).toBe(before.madeUp + 1);
    expect(after.byPrayer.fajr).toBe(before.byPrayer.fajr - 1);
    expect(after.byPrayer.dhuhr).toBe(before.byPrayer.dhuhr);
  });

  it('only ever counts up, and never drives owed below zero', () => {
    let qada = input.qada;
    let previousMadeUp = 0;

    // Hammer it well past the backlog.
    for (let i = 0; i < 200; i++) {
      qada = payBack({ ...input, qada }, 'fajr');
      const summary = qadaSummary({ ...input, qada });
      expect(summary.owed).toBeGreaterThanOrEqual(0);
      expect(summary.byPrayer.fajr).toBeGreaterThanOrEqual(0);
      expect(summary.madeUp).toBeGreaterThanOrEqual(previousMadeUp);
      previousMadeUp = summary.madeUp;
    }

    expect(qadaSummary({ ...input, qada }).byPrayer.fajr).toBe(0);
    // madeUp stopped at the backlog rather than inflating past it, so a prayer
    // missed next week is not silently swallowed by an overpayment today.
    expect(qada.madeUp.fajr).toBe(5);
    expect(payBack({ ...input, qada }, 'fajr')).toBe(qada);
  });
});

describe('a backlog entered by hand', () => {
  const base = { qada: beginOn(EMPTY_QADA, TODAY), tracker: EMPTY_TRACKER, today: TODAY };

  it('is added on top of what the app itself saw', () => {
    const qada = adjustBacklog(base.qada, 'asr', 40);
    expect(qadaSummary({ ...base, qada }).owed).toBe(40);
    expect(owedByPrayer({ ...base, qada }).asr).toBe(40);
  });

  it('can be walked back down, including below what the scan counted', () => {
    // The scan can only see taps. A user who prayed without opening the app
    // must be able to say so, or the app is arguing with her about her own life.
    const input = { qada: startedOn('2026-09-01'), tracker: EMPTY_TRACKER, today: TODAY };
    expect(qadaSummary(input).owed).toBe(45);

    let qada = input.qada;
    for (const p of PRAYER_NAMES) qada = adjustBacklog(qada, p, -9);
    expect(qadaSummary({ ...input, qada }).owed).toBe(0);

    // And further down still clamps at zero rather than going negative.
    qada = adjustBacklog(qada, 'isha', -50);
    expect(qadaSummary({ ...input, qada }).owed).toBe(0);
  });
});

describe('the plan — the point is that it ends', () => {
  it('reports nothing owed rather than a degenerate date', () => {
    const plan = qadaPlan({ qada: beginOn(EMPTY_QADA, TODAY), tracker: EMPTY_TRACKER, today: TODAY });

    expect(plan.done).toBe(true);
    expect(plan.owed).toBe(0);
    expect(plan.days).toBe(0);
    expect(plan.finish).toBeNull();
    expect(plan.progress).toBe(1);
  });

  it('projects a realistic backlog to a date a person can picture', () => {
    // A month of missed prayers: 150 prayers, one a day.
    const qada = setPace(adjustBacklog(beginOn(EMPTY_QADA, TODAY), 'fajr', 150), 7);
    const plan = qadaPlan({ qada, tracker: EMPTY_TRACKER, today: TODAY });

    expect(plan.owed).toBe(150);
    expect(plan.days).toBe(150);
    expect(plan.finish).toEqual(new Date(2027, 1, 8)); // 2027-02-08
    expect(plan.done).toBe(false);
  });

  it('finishes sooner at a faster pace and later at a slower one', () => {
    const withPace = (perWeek: number) =>
      qadaPlan({
        qada: setPace(adjustBacklog(beginOn(EMPTY_QADA, TODAY), 'isha', 70), perWeek),
        tracker: EMPTY_TRACKER,
        today: TODAY,
      });

    expect(withPace(5).days).toBe(98);
    expect(withPace(7).days).toBe(70);
    expect(withPace(14).days).toBe(35);

    const days = PACES.map((p) => withPace(p.perWeek).days);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });

  it('shows progress as something that has been done, not something outstanding', () => {
    const qada = { ...beginOn(EMPTY_QADA, TODAY), adjust: { fajr: 10 }, madeUp: { fajr: 6 } };
    const plan = qadaPlan({ qada, tracker: EMPTY_TRACKER, today: TODAY });

    expect(plan.owed).toBe(4);
    expect(plan.madeUp).toBe(6);
    expect(plan.progress).toBeCloseTo(0.6);
  });

  it('survives corrupt persisted numbers rather than printing NaN at people', () => {
    const qada = {
      ...beginOn(EMPTY_QADA, TODAY),
      adjust: { fajr: Number.NaN, dhuhr: 12 },
      madeUp: { dhuhr: 'lots' as unknown as number },
      perWeek: 0,
    };
    const plan = qadaPlan({ qada, tracker: EMPTY_TRACKER, today: TODAY });

    expect(plan.owed).toBe(12);
    expect(plan.perWeek).toBe(7);
    expect(Number.isFinite(plan.days)).toBe(true);
  });
});
