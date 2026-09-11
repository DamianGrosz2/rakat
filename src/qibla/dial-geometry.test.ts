import { describe, expect, it } from 'vitest';

import { CARDINALS, CENTRE, MINOR_TICKS, point, RING_R } from './dial-geometry.ts';

/**
 * A mirrored compass is a plausible-looking compass. If the sine is negated, or
 * the -90 is a +90, east and west swap and the qibla marker lands on the
 * reflection of where it belongs — and every screenshot still shows a tidy dial
 * with a green mark on it. So the frame is asserted rather than eyeballed.
 */
describe('the rose is a compass frame: 0° up, clockwise', () => {
  const cases: [number, string, [number, number]][] = [
    [0, 'north is straight up', [CENTRE, CENTRE - RING_R]],
    [90, 'east is to the right', [CENTRE + RING_R, CENTRE]],
    [180, 'south is straight down', [CENTRE, CENTRE + RING_R]],
    [270, 'west is to the left', [CENTRE - RING_R, CENTRE]],
    [360, 'a full turn is back at north', [CENTRE, CENTRE - RING_R]],
    [-90, 'negative angles run anticlockwise, i.e. west', [CENTRE - RING_R, CENTRE]],
  ];

  for (const [deg, what, [x, y]] of cases) {
    it(what, () => {
      const [px, py] = point(RING_R, deg);
      expect(px).toBeCloseTo(x, 9);
      expect(py).toBeCloseTo(y, 9);
    });
  }

  it('45° lands in the upper right quadrant, not the upper left', () => {
    // The single assertion that catches a mirrored dial.
    const [x, y] = point(RING_R, 45);
    expect(x).toBeGreaterThan(CENTRE);
    expect(y).toBeLessThan(CENTRE);
  });

  it('radius zero is the centre whatever the angle', () => {
    for (const deg of [0, 37, 180, 359]) {
      const [x, y] = point(0, deg);
      expect(x).toBeCloseTo(CENTRE, 9);
      expect(y).toBeCloseTo(CENTRE, 9);
    }
  });

  it('every point at the ring radius is exactly that far from the centre', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const [x, y] = point(RING_R, deg);
      expect(Math.hypot(x - CENTRE, y - CENTRE)).toBeCloseTo(RING_R, 9);
    }
  });
});

describe('tick marks', () => {
  it('has 20 minor ticks: every 15°, minus the four cardinals', () => {
    expect(MINOR_TICKS).toHaveLength(20);
    expect(MINOR_TICKS.every((d) => d % 15 === 0)).toBe(true);
    expect(MINOR_TICKS.some((d) => d % 90 === 0)).toBe(false);
  });

  it('draws the ring inside the box with room for the index mark', () => {
    // The index mark is drawn above the ring in the top margin; if the ring ever
    // grows to fill the box the two collide and the mark reads as a tick.
    expect(CENTRE - RING_R).toBeGreaterThanOrEqual(14);
  });

  it('names the four cardinals in clockwise order from north', () => {
    expect(CARDINALS.map((c) => c.letter)).toEqual(['N', 'E', 'S', 'W']);
    expect(CARDINALS.map((c) => c.deg)).toEqual([0, 90, 180, 270]);
  });
});
