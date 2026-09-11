/**
 * The compass rose's coordinate frame, kept separate from `dial.tsx` so it can
 * be asserted in node.
 *
 * It is two lines of trigonometry and it is worth its own file, because getting
 * the sign wrong mirrors the entire dial: east and west swap, the qibla marker
 * lands on the reflection of where it belongs, and the result still looks like a
 * perfectly plausible compass. There is no screenshot in which that bug is
 * visible, so it gets a test instead.
 *
 * Pure — no imports, same rule as `bearing.ts`.
 */

/** The drawing is authored at a fixed box and scaled by the SVG viewBox. */
export const BOX = 264;
export const CENTRE = BOX / 2;
/** Ring radius. The 16 units of margin are where the fixed index mark sits. */
export const RING_R = 116;

/**
 * Compass polar coordinates: 0° is straight up and angles increase clockwise.
 *
 * SVG's own convention is 0° at three o'clock increasing anticlockwise (y grows
 * downward, so the usual maths convention comes out mirrored). Hence the -90 to
 * put zero at twelve o'clock, and the *un-negated* sine, which is what turns the
 * remaining anticlockwise sweep into a clockwise one.
 */
export function point(r: number, deg: number): [x: number, y: number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CENTRE + r * Math.cos(a), CENTRE + r * Math.sin(a)];
}

/** Every 15°, minus the four cardinals, which get their own longer rule. */
export const MINOR_TICKS: readonly number[] = Array.from(
  { length: 24 },
  (_, i) => i * 15,
).filter((d) => d % 90 !== 0);

export const CARDINALS: readonly { deg: number; letter: string }[] = [
  { deg: 0, letter: 'N' },
  { deg: 90, letter: 'E' },
  { deg: 180, letter: 'S' },
  { deg: 270, letter: 'W' },
];
