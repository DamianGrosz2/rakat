import { describe, expect, it } from 'vitest';

import type { Offsets } from './methods';
import {
  DEFAULT_SETTINGS,
  hasUsableMethod,
  migrateSettings,
  SETTINGS_SCHEMA_VERSION,
  type PrayerSettings,
} from './settings';

/**
 * A blob as written by an older build: schemaVersion 0, and without the two
 * fields that were added later (highLatitudeRule, hijriOffsetDays).
 */
const V0_BLOB = {
  schemaVersion: 0,
  method: 'igmg',
  madhab: 'hanafi',
  offsets: { fajr: -4, sunrise: 0, dhuhr: 1, asr: 0, maghrib: 2, isha: -6 } satisfies Offsets,
};

describe('migrateSettings', () => {
  it('preserves method, madhab and offsets byte-identically across a version bump', () => {
    const migrated = migrateSettings(structuredClone(V0_BLOB));

    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(migrated.schemaVersion).not.toBe(V0_BLOB.schemaVersion);

    expect(migrated.method).toBe(V0_BLOB.method);
    expect(migrated.madhab).toBe(V0_BLOB.madhab);
    expect(migrated.offsets).toEqual(V0_BLOB.offsets);

    // Byte-identical, not merely deep-equal.
    expect(JSON.stringify(migrated.offsets)).toBe(JSON.stringify(V0_BLOB.offsets));
    expect(JSON.stringify([migrated.method, migrated.madhab, migrated.offsets])).toBe(
      JSON.stringify([V0_BLOB.method, V0_BLOB.madhab, V0_BLOB.offsets]),
    );
  });

  it('adds new fields with defaults and nothing else', () => {
    const migrated = migrateSettings(structuredClone(V0_BLOB));

    expect(migrated.highLatitudeRule).toBe(DEFAULT_SETTINGS.highLatitudeRule);
    expect(migrated.hijriOffsetDays).toBe(DEFAULT_SETTINGS.hijriOffsetDays);
  });

  it('is idempotent — migrating twice changes nothing', () => {
    const once = migrateSettings(structuredClone(V0_BLOB));
    const twice = migrateSettings(structuredClone(once));

    expect(twice).toEqual(once);
  });

  it('never overwrites a stored value with a default, even a falsy one', () => {
    const stored = {
      ...V0_BLOB,
      highLatitudeRule: 'twilightangle',
      hijriOffsetDays: 0,
    };
    const migrated = migrateSettings(stored);

    expect(migrated.highLatitudeRule).toBe('twilightangle');
    expect(migrated.hijriOffsetDays).toBe(0);
  });

  it('fills in an offset mark a future version adds, without touching the existing ones', () => {
    const partial = { ...V0_BLOB, offsets: { fajr: -4, isha: -6 } };
    const migrated = migrateSettings(partial);

    expect(migrated.offsets.fajr).toBe(-4);
    expect(migrated.offsets.isha).toBe(-6);
    expect(migrated.offsets.dhuhr).toBe(0);
  });

  it('keeps a method key this build no longer knows, rather than silently swapping it', () => {
    const migrated = migrateSettings({ ...V0_BLOB, method: 'some-future-institution' });

    expect(migrated.method).toBe('some-future-institution');
    expect(hasUsableMethod(migrated)).toBe(false);
  });

  it('carries unknown keys through, so a rollback does not destroy them', () => {
    const migrated = migrateSettings({ ...V0_BLOB, futureField: 'keep me' }) as PrayerSettings &
      Record<string, unknown>;

    expect(migrated.futureField).toBe('keep me');
  });

  it('returns fresh defaults for a missing or corrupt blob', () => {
    for (const blob of [null, undefined, 'nonsense', 42]) {
      const migrated = migrateSettings(blob);
      expect(migrated).toEqual(DEFAULT_SETTINGS);
      expect(hasUsableMethod(migrated)).toBe(true);
    }
  });

  it('does not hand out a shared offsets object', () => {
    const a = migrateSettings(null);
    const b = migrateSettings(null);

    a.offsets.fajr = 99;

    expect(b.offsets.fajr).toBe(0);
    expect(DEFAULT_SETTINGS.offsets.fajr).toBe(0);
  });
});
