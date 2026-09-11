import { describe, expect, it } from 'vitest';
import { generated, readFromDisk } from '../../scripts/gen-theme.ts';
import { light, dark, latinSize, weight, arabicLetterSpacing, type Palette } from './tokens.ts';

/**
 * The two platforms are supposed to name the same colours, and nothing enforces
 * that except a person remembering. A person editing Theme.swift has no reason
 * to think about an Android resource file. This test is what notices.
 *
 * The approach differs from a hand-maintained expectation table: instead of
 * asserting known hex values (which someone has to update in a third place), it
 * re-runs the generator in memory and diffs against disk. So the failure is
 * always actionable — "run npm run gen:theme" — and it catches drift in both
 * directions, including a native file edited by hand.
 */
describe('native theme files are generated from tokens.ts', () => {
  for (const [rel, expected] of Object.entries(generated())) {
    it(`${rel} is up to date`, () => {
      const onDisk = readFromDisk(rel);
      expect(onDisk, `${rel} is missing — run: npm run gen:theme`).not.toBeNull();
      expect(onDisk, `${rel} has drifted from tokens.ts — run: npm run gen:theme`).toBe(expected);
    });
  }
});

describe('design.html shows the frozen values', () => {
  // design.html is the human specimen. It is hand-authored so the layout can say
  // things a generator cannot, but the VALUES still have to be the real ones —
  // a swatch sheet that lies is worse than no swatch sheet.
  const guide = readFromDisk('design.html') ?? '';

  it('exists', () => expect(guide.length).toBeGreaterThan(0));

  for (const [name, palette] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [token, hex] of Object.entries(palette)) {
      it(`carries ${name} ${token} (${hex})`, () => {
        expect(guide.toUpperCase()).toContain(hex.toUpperCase());
      });
    }
  }
});

describe('the token system stays inside its own budget', () => {
  it('defines the same colour roles for light and dark', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  // DESIGN.md promises four Latin sizes and two weights. That promise is the
  // only thing keeping forty screens looking like one app, so it is a test.
  it('has exactly four Latin sizes and two weights', () => {
    expect(Object.keys(latinSize)).toHaveLength(4);
    expect(Object.keys(weight)).toHaveLength(2);
  });

  it('never lets tracking onto Arabic', () => {
    // Positive tracking breaks the joins in shaped Arabic. Non-negotiable.
    expect(arabicLetterSpacing).toBe(0);
  });

  it('uses well-formed 6-digit hex everywhere', () => {
    for (const p of [light, dark]) {
      for (const [k, v] of Object.entries(p)) {
        expect(v, `${k} = ${v}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });
});

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A colour tweak that quietly drops text under AA is the kind of regression
 * nobody catches by looking, because it looks fine on the designer's screen in
 * a bright room. These are the pairs that actually occur in the UI.
 */
describe('contrast holds in both appearances', () => {
  const pairs: [keyof Palette, keyof Palette][] = [
    ['ink', 'ground'],
    ['ink', 'surface'],
    ['inkMuted', 'ground'],
    ['inkMuted', 'surface'],
    ['accent', 'ground'],
    ['accent', 'surface'],
    ['accentInk', 'accent'],
    ['now', 'ground'],
  ];

  for (const [name, palette] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg] of pairs) {
      it(`${name}: ${fg} on ${bg} meets AA for body text`, () => {
        expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
