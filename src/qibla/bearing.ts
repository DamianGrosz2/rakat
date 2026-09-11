/**
 * Qibla geometry.
 *
 * Pure maths — no React, no React Native, no Expo, no imports at all — so it
 * runs under plain vitest in node exactly like `src/prayer/`. Same reasoning as
 * the prayer engine: a wrong number here is patchable via EAS Update in the same
 * hour, and it is testable without a simulator.
 *
 * A qibla that is fifteen degrees off is worse than no qibla at all, so every
 * number this file produces is pinned against published values in
 * `bearing.test.ts`.
 */

/**
 * Structurally identical to `Coords` in `src/prayer/times.ts`, declared here
 * rather than imported because this module imports nothing. TypeScript's
 * structural typing means the two interoperate without a conversion.
 */
export type Coords = { latitude: number; longitude: number };

/**
 * The Kaaba. These are the coordinates in general use for qibla calculation and
 * they are not ours to round — the sixth decimal is ~11cm, which matters not at
 * all for the bearing but does mean nobody has to wonder whether we truncated.
 */
export const KAABA: Coords = { latitude: 21.4224779, longitude: 39.826184 };

/**
 * Within this many degrees of the qibla counts as facing it.
 *
 * Three degrees is roughly the best a phone magnetometer manages when it is
 * well calibrated and away from metal, so claiming anything tighter would be
 * claiming precision the hardware does not have.
 */
export const ALIGNED_DEG = 3;

/** ...and it stays aligned until it drifts past this. See `isAligned`. */
export const RELEASE_DEG = 6;

/** Mean Earth radius (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Wraps any angle into [0, 360).
 *
 * The modulo is applied twice on purpose. `-1e-15 % 360` is `-1e-15`; adding 360
 * to that rounds to exactly 360 in floating point, which is outside the range we
 * promise. The second `% 360` brings it back to 0.
 */
export function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Initial great-circle bearing from `from` to `to`, in degrees clockwise from
 * true north, in [0, 360).
 *
 * "Initial" because on a sphere the bearing of a shortest path changes as you
 * walk it. The qibla is the bearing you face from where you stand, so it is the
 * initial one.
 */
export function initialBearing(from: Coords, to: Coords): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  // atan2(0, 0) is 0, not NaN — and that is what rescues the degenerate cases:
  // standing on the Kaaba itself, or on its antipode, where "the direction to
  // it" has no answer. A dial that reads 0° at the Kaaba is harmless; a dial
  // that reads NaN is a blank screen and a bug report.
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/**
 * The qibla: initial great-circle bearing to the Kaaba, degrees clockwise from
 * TRUE north (not magnetic — see `use-heading.ts` for why that distinction is
 * the whole ballgame).
 *
 * Great circle, not rhumb line. Every recognised method uses the shortest path
 * over the sphere, and on long paths the two answers are nothing alike: from New
 * York the great circle reads 58° — north-east, over Greenland — while a
 * constant-compass rhumb line reads about 96°, near due east. Shipping the rhumb
 * line is the single worst bug this screen could have, which is why
 * `bearing.test.ts` asserts New York is under 90°.
 */
export function qiblaBearing(from: Coords): number {
  return initialBearing(from, KAABA);
}

/**
 * Signed difference from bearing `a` to bearing `b`, in (-180, 180]. Positive
 * means `b` is clockwise of `a` — "turn right by this much".
 *
 * Subtracting two bearings directly is the classic wrap bug: `10 - 350` is
 * `-340`, which would tell someone standing 20° off the qibla to spin almost all
 * the way round.
 */
export function angleDifference(a: number, b: number): number {
  const d = normalizeBearing(b - a);
  return d > 180 ? d - 360 : d;
}

/**
 * Great-circle distance in kilometres, by the haversine formula.
 *
 * Haversine rather than the spherical law of cosines: the cosine form feeds a
 * number very close to 1 into `acos` for short distances and loses most of its
 * precision there. Both are the same length of code, so there is no reason to
 * take the one that is wrong near zero.
 */
export function greatCircleDistanceKm(a: Coords, b: Coords): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.longitude - a.longitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  // Clamp: floating point can push h a hair above 1 for antipodal points, and
  // Math.asin(1.0000000000000002) is NaN.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is the device facing the qibla, given how far off it is and whether it was
 * already aligned?
 *
 * The enter and release thresholds differ on purpose. A hand-held compass
 * jitters a degree or two even when the hand is still; with a single threshold
 * the aligned state — and the haptic that announces it — would flicker on and
 * off every time the reading crossed the line. Enter at 3°, hold until 6°.
 */
export function isAligned(delta: number, wasAligned: boolean): boolean {
  // NaN falls through as false, which is the state we want when there is no
  // reading: Math.abs(NaN) <= n is false.
  return Math.abs(delta) <= (wasAligned ? RELEASE_DEG : ALIGNED_DEG);
}
