/**
 * Rakat design tokens — THE single source of truth.
 *
 * Everything that renders a colour reads from here: the React Native app, the
 * SwiftUI widget and shield, and the Kotlin block screen. The two native files
 * are GENERATED from this one by `npm run gen:theme`, and `parity.test.ts`
 * fails the build if they drift. Never hand-edit a generated file.
 *
 *   src/theme/tokens.ts  ──gen:theme──>  targets/shared/Theme.swift
 *                        └────────────>  modules/rakat-blocking/android/src/main/res/values{,-night}/colors.xml
 *
 * Frozen 2026-09-11 from direction A ("Timetable"). See DESIGN.md for the why.
 */

/** Every colour role in the system. Adding a key here is a design decision. */
export type ColorToken =
  | 'ground'
  | 'surface'
  | 'ink'
  | 'inkMuted'
  | 'hairline'
  | 'accent'
  | 'accentInk'
  | 'now';

export type Palette = Record<ColorToken, string>;

/**
 * Light is the primary appearance — direction A is light-first, the way a
 * printed timetable is. Dark is a real design, not an inversion.
 *
 * Contrast, measured against the surface each token actually sits on, all at or
 * above WCAG AA for its size class:
 *   light  inkMuted/ground 4.8:1 · accent/ground 7.4:1 · accentInk/accent 7.1:1 · now/ground 6.9:1
 *   dark   inkMuted/ground 6.4:1 · accent/ground 5.9:1 · accentInk/accent 6.1:1 · now/ground 5.7:1
 *
 * Note the accent flips role between appearances: on light it is a dark green
 * FILL carrying pale text; on dark it is a light green carrying near-black.
 * That is why `accentInk` exists as its own token instead of a hardcoded white.
 */
export const light: Palette = {
  ground: '#EDEEE9',
  surface: '#FFFFFF',
  ink: '#171C1A',
  inkMuted: '#5E6866',
  hairline: '#CFD3CE',
  accent: '#15564A',
  accentInk: '#F2F1EA',
  now: '#A6412B',
};

export const dark: Palette = {
  ground: '#101413',
  surface: '#181D1C',
  ink: '#E8EBE8',
  inkMuted: '#929C99',
  hairline: '#2A302E',
  accent: '#4E9E8A',
  accentInk: '#0B100F',
  now: '#E07B5F',
};

/**
 * Latin type scale. FOUR sizes and TWO weights, and that is the whole budget —
 * `parity.test.ts` fails if a fifth appears. The constraint is what keeps forty
 * screens looking like one app.
 */
export const latinSize = {
  label: 11, // uppercase micro-label, +0.12em tracking
  body: 15, // table rows, paragraphs, buttons
  title: 20, // screen and section titles
  display: 44, // the next-prayer time, and nothing else
} as const;

export const weight = { regular: '400', semibold: '600' } as const;

/**
 * Arabic has its OWN scale and never borrows the Latin one. At a shared point
 * size Arabic reads optically smaller than Latin, and Quranic text carries full
 * tashkeel that needs vertical room — hence the 2.0 line height.
 */
export const arabicSize = {
  ui: 15, // prayer names in the timetable, beside Latin body
  display: 21, // the prayer name beside the display time
  quran: 23, // ayah text
} as const;

export const fonts = {
  /** Display and text, and every figure. Tabular figures on by default. */
  latin: 'Newsreader',
  /** Uppercase labels =<11px, buttons, tab bar. A serif is weak at that size. */
  latinUi: 'Archivo',
  /** Arabic UI: prayer names, institution names. */
  arabic: 'Amiri',
  /** Quranic text ONLY. Never used for UI chrome. */
  quran: 'Amiri Quran',
} as const;

/**
 * NON-NEGOTIABLE, from the build spec: tracking/letterSpacing is 0 on every
 * Arabic label, always. Positive tracking breaks the joins between letters and
 * turns shaped Arabic into nonsense. There is no exception and no "just a
 * little" — if you find yourself adding tracking to Arabic, the fix is a
 * different size or a different font, never a gap.
 */
export const arabicLetterSpacing = 0;

/** 8pt grid, with a single 4pt half-step for optical nudges. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Structure has no radius — rows, rules and the next-prayer field are printed,
 * not floating. Radius is spent only where a thing is genuinely tappable.
 */
export const radius = { structure: 0, mark: 2, button: 8 } as const;

/**
 * The timetable does not move. The only motion in the system is the cross-fade
 * when a time rolls over, and it is short enough to read as a print refresh
 * rather than an animation. Honour `prefers-reduced-motion` / Reduce Motion by
 * dropping every duration to 0.
 */
export const motion = { crossfadeMs: 180, easing: 'ease-out' } as const;

export const tokens = {
  light,
  dark,
  latinSize,
  arabicSize,
  weight,
  fonts,
  arabicLetterSpacing,
  space,
  radius,
  motion,
} as const;

export default tokens;
