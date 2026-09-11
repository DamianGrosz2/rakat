/**
 * Persisted calculation settings + versioned migration.
 *
 * Pure types and pure functions only. No storage backend here — whoever owns
 * persistence reads a blob, hands it to `migrateSettings`, and writes the result
 * back. That keeps the engine testable in node and OTA-patchable.
 *
 * THE HARD RULE: an app update must never silently change the user's calculation
 * method. `method`, `madhab` and `offsets` are load-bearing for correctness — a
 * wrong prayer time is the app's existential bug. So `migrateSettings` is
 * additive only: it fills in fields that later schema versions introduced and
 * never rewrites a value the user already has.
 */
import {
  isMethodKey,
  NO_OFFSETS,
  type MadhabKey,
  type MethodKey,
  type Offsets,
} from './methods';

/** Bump only when a NEW field is added. Never to change the meaning of an old one. */
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * 'auto' defers to adhan's recommendation for the coordinates (see times.ts).
 * The other values are adhan's HighLatitudeRule values verbatim.
 */
export type HighLatitudeSetting =
  | 'auto'
  | 'middleofthenight'
  | 'seventhofthenight'
  | 'twilightangle';

export type PrayerSettings = {
  schemaVersion: number;
  method: MethodKey;
  madhab: MadhabKey;
  /** "Match my mosque": signed minutes, applied per mark on top of the method. */
  offsets: Offsets;
  highLatitudeRule: HighLatitudeSetting;
  /** Regional moon-sighting offset in days, typically -2..+2. */
  hijriOffsetDays: number;
};

export const DEFAULT_SETTINGS: PrayerSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  method: 'ditib',
  madhab: 'shafi',
  offsets: { ...NO_OFFSETS },
  highLatitudeRule: 'auto',
  hijriOffsetDays: 0,
};

/**
 * Brings any stored blob up to the current schema.
 *
 * Additive only. An absent field gets its default; a present field is kept
 * verbatim, including a `method` string we no longer recognise — dropping it
 * would be exactly the silent change we promised never to make. Such a value
 * surfaces later as a thrown error from `getMethod`, which the UI can turn into
 * "your saved method is unavailable, pick one" rather than praying at the wrong
 * time under a different institution's angles.
 */
export function migrateSettings(stored: unknown): PrayerSettings {
  if (stored === null || typeof stored !== 'object') {
    return { ...DEFAULT_SETTINGS, offsets: { ...NO_OFFSETS } };
  }

  const old = stored as Partial<PrayerSettings>;

  return {
    // Unknown keys survive the round trip, so rolling back to an older build and
    // forward again does not destroy settings that build did not understand.
    ...old,

    // Protected: preserved byte-for-byte, only defaulted when genuinely absent.
    method: old.method ?? DEFAULT_SETTINGS.method,
    madhab: old.madhab ?? DEFAULT_SETTINGS.madhab,
    // Per-key merge, so a mark added in a future version defaults to 0 without
    // touching any offset the user already dialled in.
    offsets: { ...NO_OFFSETS, ...old.offsets },

    // Added in later schema versions: defaulted when absent, never overwritten.
    highLatitudeRule: old.highLatitudeRule ?? DEFAULT_SETTINGS.highLatitudeRule,
    hijriOffsetDays: old.hijriOffsetDays ?? DEFAULT_SETTINGS.hijriOffsetDays,

    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
}

/** True when the blob names a method this build can actually calculate. */
export function hasUsableMethod(settings: PrayerSettings): boolean {
  return isMethodKey(settings.method);
}
