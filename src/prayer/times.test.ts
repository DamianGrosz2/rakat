import { CalculationMethod } from 'adhan';
import { describe, expect, it } from 'vitest';

import { DITIB_OFFSETS, METHOD_LIST, NO_OFFSETS, withOffsets, type MethodKey } from './methods';
import { DEFAULT_SETTINGS, type PrayerSettings } from './settings';
import {
  computePrayerTimes,
  currentPrayer,
  nextPrayer,
  orderedMarks,
  type Coords,
  type PrayerTimes,
} from './times';

const BERLIN: Coords = { latitude: 52.52, longitude: 13.405 };
const TROMSO: Coords = { latitude: 69.65, longitude: 18.96 };

const SUMMER = new Date(2026, 5, 21); // 21 Jun 2026 — sun never reaches 18° below the horizon in Berlin
const WINTER = new Date(2026, 11, 21); // 21 Dec 2026

const MINUTE = 60_000;

function settings(patch: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, offsets: { ...NO_OFFSETS }, ...patch };
}

/**
 * `strict` at normal latitudes, where every mark is genuinely distinct.
 * Non-strict under the midnight sun, where the engine deliberately collapses a
 * twilight window to zero rather than inverting it (see computePrayerTimes).
 */
function expectSixOrderedMarks(times: PrayerTimes, { strict = true } = {}) {
  const marks = orderedMarks(times);
  expect(marks).toHaveLength(6);

  for (const mark of marks) {
    expect(Number.isNaN(mark.time.getTime()), `${mark.name} is not a valid date`).toBe(false);
  }

  for (let i = 1; i < marks.length; i++) {
    const message =
      `${marks[i].name} (${marks[i].time.toISOString()}) must be ` +
      `${strict ? 'after' : 'at or after'} ` +
      `${marks[i - 1].name} (${marks[i - 1].time.toISOString()})`;

    if (strict) {
      expect(marks[i].time.getTime(), message).toBeGreaterThan(marks[i - 1].time.getTime());
    } else {
      expect(marks[i].time.getTime(), message).toBeGreaterThanOrEqual(marks[i - 1].time.getTime());
    }
  }
}

describe('institution presets', () => {
  it('ships all eight required keys with a name and a parameter string', () => {
    const keys = METHOD_LIST.map((m) => m.key);
    expect(keys).toEqual([
      'ditib',
      'igmg',
      'isna',
      'mwl',
      'ummalqura',
      'egyptian',
      'karachi',
      'jafari',
    ] satisfies MethodKey[]);

    for (const preset of METHOD_LIST) {
      expect(preset.name.length, `${preset.key} needs a display name`).toBeGreaterThan(0);
      expect(preset.params.length, `${preset.key} needs a parameter string`).toBeGreaterThan(0);
    }
  });

  for (const preset of METHOD_LIST) {
    it(`${preset.key} produces six ascending marks in Berlin, summer and winter`, () => {
      for (const date of [SUMMER, WINTER]) {
        expectSixOrderedMarks(computePrayerTimes(BERLIN, date, settings({ method: preset.key })));
      }
    });
  }

  it('rejects an unknown method instead of silently substituting another one', () => {
    expect(() =>
      computePrayerTimes(BERLIN, WINTER, settings({ method: 'diyanet-typo' as MethodKey })),
    ).toThrow(/Unknown prayer calculation method/);
  });

  it('jafari is 16°/14°, not adhan Tehran (17.7°/14°)', () => {
    const jafari = METHOD_LIST.find((m) => m.key === 'jafari')!.build();
    const tehran = CalculationMethod.Tehran();

    expect(jafari.fajrAngle).toBe(16);
    expect(jafari.ishaAngle).toBe(14);
    expect(jafari.fajrAngle).not.toBe(tehran.fajrAngle);
    // Maghrib runs on a 4° depression, not at sunset, as the Jafari convention requires.
    expect(jafari.maghribAngle).toBe(4);
  });

  it('igmg is 18°/17° custom parameters, not a library preset', () => {
    const igmg = METHOD_LIST.find((m) => m.key === 'igmg')!.build();

    expect(igmg.fajrAngle).toBe(18);
    expect(igmg.ishaAngle).toBe(17);
    // adhan stamps custom parameters as 'Other' — it is not one of its presets.
    expect(igmg.method).toBe('Other');
    // Same angles as MWL, but the preset is built independently of it.
    expect(igmg.methodAdjustments.dhuhr).toBe(1);
  });
});

describe('DITIB offsets', () => {
  it('stacks on top of adhan Turkey rather than replacing its offsets', () => {
    const turkey = CalculationMethod.Turkey();
    const patched = withOffsets(CalculationMethod.Turkey(), { ...NO_OFFSETS, fajr: -2, isha: 3 });

    expect(patched.methodAdjustments.fajr).toBe(turkey.methodAdjustments.fajr - 2);
    expect(patched.methodAdjustments.isha).toBe(turkey.methodAdjustments.isha + 3);
    // Turkey's own corrections survive untouched.
    expect(patched.methodAdjustments.sunrise).toBe(turkey.methodAdjustments.sunrise);
    expect(patched.methodAdjustments.dhuhr).toBe(turkey.methodAdjustments.dhuhr);
    expect(patched.methodAdjustments.asr).toBe(turkey.methodAdjustments.asr);
    expect(patched.methodAdjustments.maghrib).toBe(turkey.methodAdjustments.maghrib);
  });

  it('applies the shipped DITIB table on top of Turkey', () => {
    const turkey = CalculationMethod.Turkey();
    const ditib = METHOD_LIST.find((m) => m.key === 'ditib')!.build();

    for (const mark of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
      expect(ditib.methodAdjustments[mark]).toBe(turkey.methodAdjustments[mark] + DITIB_OFFSETS[mark]);
    }
  });

  it('adds the user offsets on top of the institution offsets, not instead of them', () => {
    const plain = computePrayerTimes(BERLIN, WINTER, settings({ method: 'ditib' }));
    const nudged = computePrayerTimes(
      BERLIN,
      WINTER,
      settings({ method: 'ditib', offsets: { ...NO_OFFSETS, maghrib: 4 } }),
    );

    expect(nudged.prayers.maghrib.getTime() - plain.prayers.maghrib.getTime()).toBe(4 * MINUTE);
  });
});

describe('asr madhab', () => {
  it('Hanafi Asr is strictly later than Shafi Asr, same day, same place', () => {
    for (const date of [SUMMER, WINTER]) {
      const shafi = computePrayerTimes(BERLIN, date, settings({ madhab: 'shafi' }));
      const hanafi = computePrayerTimes(BERLIN, date, settings({ madhab: 'hanafi' }));

      expect(hanafi.prayers.asr.getTime()).toBeGreaterThan(shafi.prayers.asr.getTime());
      // Nothing else moves.
      expect(hanafi.prayers.dhuhr.getTime()).toBe(shafi.prayers.dhuhr.getTime());
      expect(hanafi.prayers.maghrib.getTime()).toBe(shafi.prayers.maghrib.getTime());
    }
  });
});

describe('per-prayer manual offsets', () => {
  it('moves exactly the offset prayers by exactly the offset, leaving the rest alone', () => {
    const base = computePrayerTimes(BERLIN, WINTER, settings());
    const shifted = computePrayerTimes(
      BERLIN,
      WINTER,
      settings({ offsets: { ...NO_OFFSETS, fajr: 7, asr: -3 } }),
    );

    expect(shifted.prayers.fajr.getTime() - base.prayers.fajr.getTime()).toBe(7 * MINUTE);
    expect(shifted.prayers.asr.getTime() - base.prayers.asr.getTime()).toBe(-3 * MINUTE);

    expect(shifted.sunrise.getTime()).toBe(base.sunrise.getTime());
    expect(shifted.prayers.dhuhr.getTime()).toBe(base.prayers.dhuhr.getTime());
    expect(shifted.prayers.maghrib.getTime()).toBe(base.prayers.maghrib.getTime());
    expect(shifted.prayers.isha.getTime()).toBe(base.prayers.isha.getTime());
  });

  it('offsets each mark independently, including sunrise', () => {
    const base = computePrayerTimes(BERLIN, WINTER, settings());
    const shifted = computePrayerTimes(
      BERLIN,
      WINTER,
      settings({ offsets: { ...NO_OFFSETS, sunrise: 2 } }),
    );

    expect(shifted.sunrise.getTime() - base.sunrise.getTime()).toBe(2 * MINUTE);
    expect(shifted.prayers.fajr.getTime()).toBe(base.prayers.fajr.getTime());
  });
});

describe('nextPrayer / currentPrayer', () => {
  const times = computePrayerTimes(BERLIN, WINTER, settings());

  it('walks forward through the day', () => {
    const beforeFajr = new Date(times.prayers.fajr.getTime() - MINUTE);
    expect(nextPrayer(times, beforeFajr).name).toBe('fajr');

    expect(nextPrayer(times, times.prayers.fajr).name).toBe('dhuhr');
    expect(nextPrayer(times, times.prayers.dhuhr).name).toBe('asr');
    expect(nextPrayer(times, times.prayers.asr).name).toBe('maghrib');
    expect(nextPrayer(times, times.prayers.maghrib).name).toBe('isha');
  });

  it('never returns sunrise — it is a mark, not a prayer', () => {
    const betweenFajrAndSunrise = new Date(times.prayers.fajr.getTime() + MINUTE);
    expect(nextPrayer(times, betweenFajrAndSunrise).name).toBe('dhuhr');
  });

  it("after Isha the next prayer is tomorrow's Fajr, not undefined", () => {
    const afterIsha = new Date(times.prayers.isha.getTime() + MINUTE);
    const next = nextPrayer(times, afterIsha);

    expect(next.name).toBe('fajr');
    expect(next.time.getTime()).toBeGreaterThan(times.prayers.isha.getTime());

    const tomorrow = computePrayerTimes(
      BERLIN,
      new Date(WINTER.getFullYear(), WINTER.getMonth(), WINTER.getDate() + 1),
      settings(),
    );
    expect(next.time.getTime()).toBe(tomorrow.prayers.fajr.getTime());
  });

  it('reports the prayer whose window is open', () => {
    expect(currentPrayer(times, times.prayers.fajr).name).toBe('fajr');
    expect(currentPrayer(times, new Date(times.prayers.asr.getTime() + MINUTE)).name).toBe('asr');
    expect(currentPrayer(times, new Date(times.prayers.isha.getTime() + MINUTE)).name).toBe('isha');
  });

  it("before Fajr the open window is still yesterday's Isha", () => {
    const beforeFajr = new Date(times.prayers.fajr.getTime() - MINUTE);
    const current = currentPrayer(times, beforeFajr);

    expect(current.name).toBe('isha');
    expect(current.time.getTime()).toBeLessThan(times.prayers.fajr.getTime());
  });
});

describe('high latitude', () => {
  it('Tromsø in June yields six valid, ascending marks with Isha after Maghrib', () => {
    for (const day of [1, 21, 30]) {
      const times = computePrayerTimes(TROMSO, new Date(2026, 5, day), settings());
      expectSixOrderedMarks(times, { strict: false });
      expect(times.prayers.isha.getTime()).toBeGreaterThanOrEqual(
        times.prayers.maghrib.getTime(),
      );
      expect(times.prayers.fajr.getTime()).toBeLessThanOrEqual(times.sunrise.getTime());
    }
  });

  it('every preset survives Tromsø midsummer', () => {
    for (const preset of METHOD_LIST) {
      for (const day of [1, 11, 21, 30]) {
        const times = computePrayerTimes(TROMSO, new Date(2026, 5, day), settings({ method: preset.key }));
        expectSixOrderedMarks(times, { strict: false });
      }
    }
  });

  it('defaults Berlin to seventh-of-the-night, not middle-of-the-night', () => {
    // Middle-of-the-night in Berlin midsummer puts Fajr around 01:45 local. The
    // default must be the tighter rule or the summer screen is nonsense.
    const auto = computePrayerTimes(BERLIN, SUMMER, settings());
    const middle = computePrayerTimes(
      BERLIN,
      SUMMER,
      settings({ highLatitudeRule: 'middleofthenight' }),
    );

    expect(auto.prayers.fajr.getTime()).toBeGreaterThan(middle.prayers.fajr.getTime());
    expect(auto.prayers.isha.getTime()).toBeLessThan(middle.prayers.isha.getTime());
  });

  it('honours an explicit high-latitude rule over the automatic one', () => {
    const explicit = computePrayerTimes(
      BERLIN,
      SUMMER,
      settings({ highLatitudeRule: 'middleofthenight' }),
    );
    const auto = computePrayerTimes(BERLIN, SUMMER, settings({ highLatitudeRule: 'auto' }));

    expect(explicit.prayers.fajr.getTime()).not.toBe(auto.prayers.fajr.getTime());
  });
});
