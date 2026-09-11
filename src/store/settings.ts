/**
 * Persistence for prayer settings.
 *
 * The pure logic — defaults, the schema version, and the migration that must
 * never silently change someone's calculation method — lives in
 * `@/prayer/settings` and is unit-tested there. This file is only the storage
 * edge, so nothing here needs a device to be tested.
 *
 * Storage is `expo-sqlite/kv-store` rather than AsyncStorage: expo-sqlite is
 * already a dependency (the mushaf needs it), it is backed by a real database
 * file rather than a plist/SharedPreferences blob, and it survives app updates.
 * "Settings survive updates" is a stated spec requirement and a live complaint
 * about the competition.
 */

import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_SETTINGS, migrateSettings, type PrayerSettings } from '@/prayer/settings';

const KEY = 'prayer.settings.v1';

/**
 * Module-level cache so the first paint after a warm start does not flash the
 * defaults. Written by `loadSettings`, read by `useSettings`.
 */
let cached: PrayerSettings | null = null;

export async function loadSettings(): Promise<PrayerSettings> {
  if (cached) return cached;
  try {
    const raw = await Storage.getItem(KEY);
    // migrateSettings is total: it takes `unknown` and always returns a valid
    // settings object, so corrupt JSON degrades to defaults rather than a crash
    // on a screen the user cannot get past.
    cached = migrateSettings(raw ? JSON.parse(raw) : null);
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return cached;
}

export async function saveSettings(next: PrayerSettings): Promise<void> {
  cached = next;
  await Storage.setItem(KEY, JSON.stringify(next));
}

/**
 * Settings plus a setter that persists. `ready` is false until the first read
 * completes — screens should render nothing method-dependent before then rather
 * than showing default times that change under the user a frame later.
 */
export function useSettings() {
  const [settings, setSettings] = useState<PrayerSettings>(cached ?? DEFAULT_SETTINGS);
  const [ready, setReady] = useState(cached !== null);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<PrayerSettings>) => {
    const next = { ...(cached ?? DEFAULT_SETTINGS), ...patch };
    setSettings(next);
    await saveSettings(next);
  }, []);

  return { settings, ready, update };
}

/* ------------------------------------------------------------------------- */

/**
 * Whether onboarding has been seen. Deliberately NOT part of `PrayerSettings`:
 * that type is about how prayer times are calculated, it is versioned, and its
 * migration is covered by a test asserting that an update never changes a
 * user's method. App-lifecycle state does not belong in it.
 *
 * Set when the flow finishes AND when it is skipped — skipping is permanent, so
 * the app never asks twice. "No nagging" is an onboarding requirement.
 */
const ONBOARDED_KEY = 'onboarded.v1';

let onboardedCache: boolean | null = null;

export async function loadOnboarded(): Promise<boolean> {
  if (onboardedCache !== null) return onboardedCache;
  try {
    onboardedCache = (await Storage.getItem(ONBOARDED_KEY)) === 'true';
  } catch {
    onboardedCache = false;
  }
  return onboardedCache;
}

export function useOnboarded() {
  const [onboarded, setOnboarded] = useState<boolean>(onboardedCache ?? false);
  const [ready, setReady] = useState(onboardedCache !== null);

  useEffect(() => {
    let alive = true;
    loadOnboarded().then((v) => {
      if (!alive) return;
      setOnboarded(v);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const finish = useCallback(async () => {
    onboardedCache = true;
    setOnboarded(true);
    await Storage.setItem(ONBOARDED_KEY, 'true');
  }, []);

  return { onboarded, ready, finish };
}

/* ------------------------------------------------------------------------- */

/**
 * Whether the user has turned the prayer-time app lock on.
 *
 * Separate from `PrayerSettings` for the same reason `onboarded` is: that type
 * is about how prayer times are calculated and its migration is under test.
 * This is a feature toggle.
 */
const LOCK_KEY = 'lock.enabled.v1';

let lockCache: boolean | null = null;

export function useLockEnabled() {
  const [enabled, setEnabled] = useState<boolean>(lockCache ?? false);

  useEffect(() => {
    let alive = true;
    Storage.getItem(LOCK_KEY)
      .then((v) => {
        lockCache = v === 'true';
        if (alive) setEnabled(lockCache);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    lockCache = next;
    setEnabled(next);
    await Storage.setItem(LOCK_KEY, String(next));
  }, []);

  return { enabled, toggle };
}

/* ------------------------------------------------------------------------- */

/**
 * Whether the athan calls at each prayer time.
 *
 * Defaults to OFF and is turned on explicitly — during onboarding or in
 * Settings — because turning it on requires the notification permission, and a
 * toggle that reads "on" while the OS silences every notification is a lie.
 */
const ATHAN_KEY = 'athan.enabled.v1';

let athanCache: boolean | null = null;

export function useAthanEnabled() {
  const [enabled, setEnabled] = useState<boolean>(athanCache ?? false);
  const [ready, setReady] = useState(athanCache !== null);

  useEffect(() => {
    let alive = true;
    Storage.getItem(ATHAN_KEY)
      .then((v) => {
        athanCache = v === 'true';
        if (!alive) return;
        setEnabled(athanCache);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    athanCache = next;
    setEnabled(next);
    await Storage.setItem(ATHAN_KEY, String(next));
  }, []);

  return { enabled, ready, toggle };
}
