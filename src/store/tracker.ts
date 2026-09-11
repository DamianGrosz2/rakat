/**
 * Persistence for the prayer tracker: what was prayed, the days on which the
 * prayers were lifted, and the qada' state.
 *
 * The logic itself is pure and unit-tested elsewhere — `@/lock/prayed` for the
 * mark transition, `@/tracker/menses`, `@/tracker/qada` and
 * `@/tracker/consistency` for the rest. This file is only the storage edge, in
 * the same shape as `@/store/settings`: `expo-sqlite/kv-store`, a module-level
 * cache so a warm start does not flash empty figures, `useState` + `useEffect`.
 *
 * Three keys rather than one. They are written at very different rates (a mark
 * several times a day, a period twice a month, qada' rarely), they version
 * independently, and a corrupt blob then costs one of the three rather than all
 * of the user's history.
 */

import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState } from 'react';

import {
  EMPTY_TRACKER,
  marksForDay,
  prayed,
  type PrayedInput,
  type PrayerMark,
  type TrackerState,
} from '@/lock/prayed';
import type { PrayerName } from '@/prayer/methods';
import { daysConsistent } from '@/tracker/consistency';
import {
  EMPTY_MENSES,
  endPeriod,
  startPeriod,
  type MensesState,
} from '@/tracker/menses';
import {
  EMPTY_QADA,
  adjustBacklog,
  beginOn,
  payBack,
  setPace,
  type QadaState,
} from '@/tracker/qada';

export { daysConsistent };

const KEY = 'tracker.v1';
const MENSES_KEY = 'tracker.menses.v1';
const QADA_KEY = 'tracker.qada.v1';

let cached: TrackerState | null = null;
let cachedMenses: MensesState | null = null;
let cachedQada: QadaState | null = null;

/**
 * Persisted JSON is a trust boundary — a half-written blob, a downgrade, or a
 * hand-edited database must not take the tracker screen down on launch, which
 * is a screen the user cannot get past. Each loader below re-establishes the
 * SHAPE it promises; `@/tracker/qada` guards the individual values.
 */
async function read(key: string): Promise<Record<string, unknown>> {
  try {
    const raw = await Storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isObject = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export async function loadTracker(): Promise<TrackerState> {
  if (cached) return cached;
  const raw = await read(KEY);
  cached = isObject(raw.marks) ? ({ ...EMPTY_TRACKER, ...raw } as TrackerState) : EMPTY_TRACKER;
  return cached;
}

export async function loadMenses(): Promise<MensesState> {
  if (cachedMenses) return cachedMenses;
  const raw = await read(MENSES_KEY);
  cachedMenses = Array.isArray(raw.periods) ? { periods: raw.periods } : EMPTY_MENSES;
  return cachedMenses;
}

/**
 * Qada' state, stamping the start day on the very first read.
 *
 * That stamp is what makes "a fresh install owes nothing" true: the scan only
 * looks at days after it. An existing user upgrading into this feature is
 * stamped today as well, so the update cannot conjure a backlog out of the
 * months before it — there is no honest way to know what happened then, and
 * guessing wrong in that direction is unforgivable.
 */
export async function loadQada(today = new Date()): Promise<QadaState> {
  if (cachedQada) return cachedQada;
  const raw = await read(QADA_KEY);
  const stored: QadaState = {
    startedOn: typeof raw.startedOn === 'string' ? raw.startedOn : null,
    adjust: isObject(raw.adjust) ? raw.adjust : {},
    madeUp: isObject(raw.madeUp) ? raw.madeUp : {},
    perWeek: typeof raw.perWeek === 'number' ? raw.perWeek : EMPTY_QADA.perWeek,
  };
  cachedQada = beginOn(stored, today);
  if (!stored.startedOn) await Storage.setItem(QADA_KEY, JSON.stringify(cachedQada));
  return cachedQada;
}

/**
 * Every hook below reads the same three module caches, so a write from one has
 * to wake the others. Expo Router keeps tab screens MOUNTED: without this,
 * marking Fajr on the tracker tab leaves the home tab holding a stale copy
 * until it happens to remount, and turning menses mode on would not reach
 * `use-lock-sync` until the next cold start — by which time the shield has
 * already fired at a prayer that was not due.
 *
 * ponytail: a Set of callbacks, not a state library. Three caches, one app.
 */
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

/**
 * The menses state on its own, for `@/lock/use-lock-sync`.
 *
 * `ready` matters there more than it does on screen: the lock must not write a
 * horizon of schedules from an empty default while the store is still loading,
 * because those schedules fire whether or not the app is ever opened again.
 */
export function useMenses() {
  const [menses, setMenses] = useState<MensesState>(cachedMenses ?? EMPTY_MENSES);
  const [ready, setReady] = useState(cachedMenses !== null);
  const pull = useCallback(() => setMenses(cachedMenses ?? EMPTY_MENSES), []);

  useEffect(() => {
    let alive = true;
    listeners.add(pull);
    loadMenses().then(() => {
      if (!alive) return;
      pull();
      setReady(true);
    });
    return () => {
      alive = false;
      listeners.delete(pull);
    };
  }, [pull]);

  return { menses, ready };
}

export function useTracker() {
  const [state, setState] = useState<TrackerState>(cached ?? EMPTY_TRACKER);
  const [menses, setMenses] = useState<MensesState>(cachedMenses ?? EMPTY_MENSES);
  const [qada, setQada] = useState<QadaState>(cachedQada ?? EMPTY_QADA);
  const [ready, setReady] = useState(cached !== null && cachedMenses !== null && cachedQada !== null);

  const pull = useCallback(() => {
    setState(cached ?? EMPTY_TRACKER);
    setMenses(cachedMenses ?? EMPTY_MENSES);
    setQada(cachedQada ?? EMPTY_QADA);
  }, []);

  useEffect(() => {
    let alive = true;
    listeners.add(pull);
    Promise.all([loadTracker(), loadMenses(), loadQada()]).then(() => {
      if (!alive) return;
      pull();
      setReady(true);
    });
    return () => {
      alive = false;
      listeners.delete(pull);
    };
  }, [pull]);

  // Each writer updates the cache, wakes every mounted hook, then persists. The
  // screen moves on the cache; the write is just durability.
  const mark = useCallback(async (input: PrayedInput) => {
    const result = prayed(cached ?? EMPTY_TRACKER, input);
    cached = result.state;
    announce();
    await Storage.setItem(KEY, JSON.stringify(result.state));
    return result;
  }, []);

  const saveMenses = useCallback(async (next: MensesState) => {
    cachedMenses = next;
    announce();
    await Storage.setItem(MENSES_KEY, JSON.stringify(next));
  }, []);

  const saveQada = useCallback(async (next: QadaState) => {
    cachedQada = next;
    announce();
    await Storage.setItem(QADA_KEY, JSON.stringify(next));
  }, []);

  const today = useCallback(
    (date = new Date()): PrayerMark[] => marksForDay(state, date),
    [state],
  );

  return {
    state,
    menses,
    qada,
    ready,
    mark,
    today,
    daysConsistent: daysConsistent(state, menses),
    // Writers read the CACHE, never the rendered copy: two taps in the same
    // frame must not both fold into the same stale state and lose one.
    beginPeriod: (on?: Date) => saveMenses(startPeriod(cachedMenses ?? EMPTY_MENSES, on)),
    finishPeriod: (on?: Date) => saveMenses(endPeriod(cachedMenses ?? EMPTY_MENSES, on)),
    prayedOneBack: (prayer: PrayerName, now = new Date()) =>
      saveQada(
        payBack(
          {
            qada: cachedQada ?? EMPTY_QADA,
            tracker: cached ?? EMPTY_TRACKER,
            menses: cachedMenses ?? EMPTY_MENSES,
            today: now,
          },
          prayer,
        ),
      ),
    adjustBacklog: (prayer: PrayerName, delta: number) =>
      saveQada(adjustBacklog(cachedQada ?? EMPTY_QADA, prayer, delta)),
    setPace: (perWeek: number) => saveQada(setPace(cachedQada ?? EMPTY_QADA, perWeek)),
  };
}
