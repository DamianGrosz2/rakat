/**
 * The one way to read design tokens in a component.
 *
 *   const t = useTheme();
 *   <View style={{ backgroundColor: t.color.ground, padding: t.space.lg }}>
 *
 * Values come from `src/theme/tokens.ts`, which also generates the SwiftUI and
 * Kotlin colours. See DESIGN.md for what each role means and which rules are
 * enforced by `src/theme/parity.test.ts`.
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Fonts } from '@/constants/theme';
import {
  arabicLetterSpacing,
  arabicSize,
  dark,
  latinSize,
  light,
  motion,
  radius,
  space,
  weight,
  type Palette,
} from '@/theme/tokens';

export type Theme = {
  scheme: 'light' | 'dark';
  color: Palette;
  latinSize: typeof latinSize;
  arabicSize: typeof arabicSize;
  weight: typeof weight;
  font: typeof Fonts;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  /** Always 0. Spread onto every Arabic Text — see `arabicText`. */
  arabicLetterSpacing: typeof arabicLetterSpacing;
};

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    scheme,
    color: scheme === 'dark' ? dark : light,
    latinSize,
    arabicSize,
    weight,
    font: Fonts,
    space,
    radius,
    motion,
    arabicLetterSpacing,
  };
}

/**
 * Style for an Arabic run. Use this instead of hand-writing the style, because
 * it is the one place `letterSpacing: 0` is guaranteed.
 *
 * Positive tracking prises apart the joins between Arabic letters — the result
 * is not merely ugly, it is unreadable, and in Quranic text it is wrong. There
 * is no "just a little". DESIGN.md states the rule; this function is how it
 * survives contact with forty screens.
 *
 * Remember the other two rules it cannot enforce for you:
 *   - one <Text> per line, never split a line to style part of it
 *   - highlights are absolutely-positioned <View>s BEHIND the text
 */
export function arabicText(
  t: Theme,
  variant: keyof typeof arabicSize = 'ui',
  color: string = t.color.ink,
) {
  const lineHeightFactor = { ui: 1.6, display: 1.4, quran: 2.0 }[variant];
  return {
    fontFamily: variant === 'quran' ? t.font.quran : t.font.arabic,
    fontSize: t.arabicSize[variant],
    lineHeight: Math.round(t.arabicSize[variant] * lineHeightFactor),
    letterSpacing: 0,
    color,
    writingDirection: 'rtl',
  } as const;
}

/** Latin figures that must not shift column: times, countdowns, counters. */
export const tabularNums = { fontVariant: ['tabular-nums'] satisfies string[] as ('tabular-nums')[] };
