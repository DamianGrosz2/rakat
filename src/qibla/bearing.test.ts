import { describe, expect, it } from 'vitest';

import {
  ALIGNED_DEG,
  angleDifference,
  greatCircleDistanceKm,
  initialBearing,
  isAligned,
  KAABA,
  normalizeBearing,
  qiblaBearing,
  RELEASE_DEG,
  type Coords,
} from './bearing.ts';

/**
 * This is the file that matters.
 *
 * Everything else in the qibla feature is presentation; if these numbers are
 * wrong, the app confidently points several thousand people the wrong way and
 * looks trustworthy while doing it. A qibla that is fifteen degrees off is worse
 * than no qibla at all, because a user with no qibla asks someone.
 *
 * Each city carries TWO assertions:
 *   - within 1° of the value published in qibla tables — the thing a human can
 *     check against a mosque noticeboard;
 *   - and a tight lock on our own computation, so a later refactor that changes
 *     the formula (a rhumb line, a different Earth model, a lat/lon swap) fails
 *     loudly instead of drifting a degree at a time.
 */
const CITIES = [
  // city          coords                                published  ours (6dp)   km
  ['Berlin', { latitude: 52.52, longitude: 13.405 }, 136.7, 136.684918, 4130.2],
  ['Jakarta', { latitude: -6.2, longitude: 106.8 }, 295.2, 295.160485, 7915.2],
  ['New York', { latitude: 40.71, longitude: -74.01 }, 58.5, 58.479156, 10306.8],
  ['Cape Town', { latitude: -33.92, longitude: 18.42 }, 23.4, 23.35787, 6558.0],
  ['London', { latitude: 51.5074, longitude: -0.1278 }, 119.0, 118.987256, 4793.8],
  ['Istanbul', { latitude: 41.0082, longitude: 28.9784 }, 151.6, 151.620651, 2405.1],
  ['Sydney', { latitude: -33.8688, longitude: 151.2093 }, 277.5, 277.499559, 13236.3],
  ['Kuala Lumpur', { latitude: 3.139, longitude: 101.6869 }, 292.5, 292.537681, 6973.9],
] as const satisfies readonly (readonly [string, Coords, number, number, number])[];

describe('qiblaBearing matches published qibla tables', () => {
  for (const [city, coords, published, exact] of CITIES) {
    it(`${city} is ${published}° (±1°)`, () => {
      expect(qiblaBearing(coords)).toBeCloseTo(published, 0);
    });

    it(`${city} stays at ${exact}°`, () => {
      // 4 decimal places ≈ 1cm of arc. This is a regression lock, not a claim of
      // accuracy — it is here so a change to the maths cannot pass silently.
      expect(qiblaBearing(coords)).toBeCloseTo(exact, 4);
    });
  }

  it('is a great circle, not a rhumb line', () => {
    // The classic qibla bug: computing the bearing on a Mercator projection.
    // From New York that gives ~96° (due east, across the Atlantic) instead of
    // ~58° (north-east, over Greenland) — a 38° error that looks plausible on a
    // flat map and is completely wrong on the ground.
    const newYork = { latitude: 40.71, longitude: -74.01 };
    expect(qiblaBearing(newYork)).toBeLessThan(90);
    expect(qiblaBearing(newYork)).toBeGreaterThan(45);
  });
});

describe('greatCircleDistanceKm', () => {
  for (const [city, coords, , , km] of CITIES) {
    it(`${city} is ${km} km from Makkah`, () => {
      expect(greatCircleDistanceKm(coords, KAABA)).toBeCloseTo(km, 0);
    });
  }

  it('is zero at the Kaaba', () => {
    expect(greatCircleDistanceKm(KAABA, KAABA)).toBe(0);
  });

  it('is symmetric', () => {
    const berlin = { latitude: 52.52, longitude: 13.405 };
    expect(greatCircleDistanceKm(berlin, KAABA)).toBeCloseTo(
      greatCircleDistanceKm(KAABA, berlin),
      9,
    );
  });

  it('is half the circumference at the antipode, not NaN', () => {
    const antipode = { latitude: -KAABA.latitude, longitude: KAABA.longitude - 180 };
    const km = greatCircleDistanceKm(antipode, KAABA);
    expect(Number.isNaN(km)).toBe(false);
    // π · 6371.0088
    expect(km).toBeCloseTo(20015.1, 0);
  });
});

/**
 * The degenerate inputs. None of these is a place anyone prays, and all of them
 * are reachable: a spoofed simulator location, a manual entry with a typo, a GPS
 * fix that has not converged. NaN here would render an empty dial with no
 * explanation, which is the failure mode the screen exists to avoid.
 */
describe('degenerate positions never produce NaN', () => {
  const degenerate: [string, Coords][] = [
    ['the Kaaba itself', KAABA],
    ['the Kaaba antipode', { latitude: -KAABA.latitude, longitude: KAABA.longitude - 180 }],
    ['the north pole', { latitude: 90, longitude: 0 }],
    ['the south pole', { latitude: -90, longitude: 0 }],
    ['the north pole at the date line', { latitude: 90, longitude: 180 }],
    ['the equator at the date line', { latitude: 0, longitude: 180 }],
    ['null island', { latitude: 0, longitude: 0 }],
    ['the Kaaba meridian, far south', { latitude: -89.999, longitude: KAABA.longitude }],
    ['one metre off the Kaaba', { latitude: KAABA.latitude + 0.00001, longitude: KAABA.longitude }],
  ];

  for (const [label, coords] of degenerate) {
    it(`${label} gives a finite bearing in [0, 360)`, () => {
      const b = qiblaBearing(coords);
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    });

    it(`${label} gives a finite distance`, () => {
      const km = greatCircleDistanceKm(coords, KAABA);
      expect(Number.isFinite(km)).toBe(true);
      expect(km).toBeGreaterThanOrEqual(0);
    });
  }

  it('standing on the Kaaba resolves to 0, not NaN', () => {
    // atan2(0, 0) === 0. Asserted explicitly because it is the one degenerate
    // case a reader will actually hit (the simulator's default location can be
    // set to Makkah) and because it depends on a JS detail worth pinning.
    expect(qiblaBearing(KAABA)).toBe(0);
  });
});

describe('every bearing lands in [0, 360)', () => {
  it('across a global grid', () => {
    for (let lat = -90; lat <= 90; lat += 5) {
      for (let lon = -180; lon <= 180; lon += 5) {
        const b = qiblaBearing({ latitude: lat, longitude: lon });
        expect(Number.isFinite(b), `${lat},${lon}`).toBe(true);
        expect(b, `${lat},${lon}`).toBeGreaterThanOrEqual(0);
        expect(b, `${lat},${lon}`).toBeLessThan(360);
      }
    }
  });

  it('normalizes out-of-range input without landing on 360', () => {
    expect(normalizeBearing(0)).toBe(0);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(-360)).toBe(0);
    expect(normalizeBearing(720.5)).toBeCloseTo(0.5, 10);
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(-1e-15)).toBe(0); // would be exactly 360 with one modulo
    expect(normalizeBearing(359.9999)).toBeCloseTo(359.9999, 10);
  });

  it('is reciprocal: the Kaaba sees Berlin roughly back the other way', () => {
    const berlin = { latitude: 52.52, longitude: 13.405 };
    const out = initialBearing(berlin, KAABA);
    const back = initialBearing(KAABA, berlin);
    // Not exactly 180° apart — that is the point of a great circle, the bearing
    // turns along the path — but within 40° over this distance.
    expect(Math.abs(Math.abs(angleDifference(out, back)) - 180)).toBeLessThan(40);
  });
});

describe('angleDifference wraps across 0/360', () => {
  const cases: [number, number, number][] = [
    [350, 10, 20], // the case that breaks naive subtraction
    [10, 350, -20],
    [0, 0, 0],
    [0, 90, 90],
    [90, 0, -90],
    [0, 180, 180], // exactly opposite resolves to +180, the closed end of the range
    [180, 0, 180],
    [0, 181, -179],
    [359, 1, 2],
    [1, 359, -2],
    [136.7, 139.2, 2.5],
    [-10, 10, 20], // negative input
    [710, 10, 20], // input past a full turn
    [350, 730, 20], // both past a full turn
  ];

  for (const [a, b, expected] of cases) {
    it(`${a} -> ${b} is ${expected}`, () => {
      expect(angleDifference(a, b)).toBeCloseTo(expected, 10);
    });
  }

  it('always lands in (-180, 180]', () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 7) {
        const d = angleDifference(a, b);
        expect(d, `${a} -> ${b}`).toBeGreaterThan(-180);
        expect(d, `${a} -> ${b}`).toBeLessThanOrEqual(180);
      }
    }
  });

  it('is antisymmetric except at the closed end', () => {
    for (let a = 0; a < 360; a += 11) {
      for (let b = 0; b < 360; b += 13) {
        const d = angleDifference(a, b);
        if (d === 180) continue; // both directions report +180
        expect(angleDifference(b, a), `${a} -> ${b}`).toBeCloseTo(-d, 10);
      }
    }
  });
});

describe('isAligned holds its state through jitter', () => {
  it(`enters at ${ALIGNED_DEG}° and not a degree wider`, () => {
    expect(isAligned(0, false)).toBe(true);
    expect(isAligned(ALIGNED_DEG, false)).toBe(true);
    expect(isAligned(-ALIGNED_DEG, false)).toBe(true);
    expect(isAligned(ALIGNED_DEG + 0.01, false)).toBe(false);
    expect(isAligned(-ALIGNED_DEG - 0.01, false)).toBe(false);
  });

  it(`holds until ${RELEASE_DEG}° once aligned`, () => {
    expect(isAligned(ALIGNED_DEG + 1, true)).toBe(true);
    expect(isAligned(RELEASE_DEG, true)).toBe(true);
    expect(isAligned(-RELEASE_DEG, true)).toBe(true);
    expect(isAligned(RELEASE_DEG + 0.01, true)).toBe(false);
  });

  it('does not flicker when a reading oscillates across the entry threshold', () => {
    // A hand holding a phone jitters. Without the release band this sequence
    // would toggle six times and fire six haptics.
    const readings = [2.9, 3.1, 2.8, 3.2, 2.7, 3.4, 2.9];
    let aligned = false;
    let transitions = 0;
    for (const d of readings) {
      const next = isAligned(d, aligned);
      if (next !== aligned) transitions += 1;
      aligned = next;
    }
    expect(transitions).toBe(1);
    expect(aligned).toBe(true);
  });

  it('is false for a missing reading', () => {
    expect(isAligned(NaN, false)).toBe(false);
    expect(isAligned(NaN, true)).toBe(false);
  });
});
