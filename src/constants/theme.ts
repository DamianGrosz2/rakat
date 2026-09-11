/**
 * Adapter over the real design tokens.
 *
 * The `create-expo-app` template shipped its own `Colors` / `Fonts` / `Spacing`
 * here and several template components import them. Rather than run two theme
 * systems side by side — which is how a codebase ends up with two greys that are
 * almost the same — this file keeps the template's export names but derives every
 * value from `src/theme/tokens.ts`.
 *
 * New code should use `useTheme()` from `@/hooks/use-theme`, not these exports.
 * See DESIGN.md.
 */

import { Platform } from 'react-native';
import { dark, light, fonts, space } from '@/theme/tokens';

/** Template role -> design token. */
export const Colors = {
  light: {
    text: light.ink,
    background: light.ground,
    backgroundElement: light.surface,
    backgroundSelected: light.hairline,
    textSecondary: light.inkMuted,
  },
  dark: {
    text: dark.ink,
    background: dark.ground,
    backgroundElement: dark.surface,
    backgroundSelected: dark.hairline,
    textSecondary: dark.inkMuted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The bundled faces, by the key they are registered under in `_layout.tsx`.
 * There is no system-font fallback on purpose: a serif timetable that silently
 * falls back to San Francisco is a different product, and Arabic that falls back
 * to the system face loses the Quranic marks Amiri Quran carries.
 */
export const Fonts = {
  /** Display, text, and every figure. Tabular figures via fontVariant. */
  latin: `${fonts.latin}-Regular`,
  latinSemibold: `${fonts.latin}-SemiBold`,
  /** Uppercase labels =<11px, buttons, tab bar. */
  latinUi: `${fonts.latinUi}-Regular`,
  latinUiSemibold: `${fonts.latinUi}-SemiBold`,
  /** Arabic UI: prayer names, institution names. */
  arabic: `${fonts.arabic}-Regular`,
  arabicBold: `${fonts.arabic}-Bold`,
  /** Quranic text ONLY. Never UI chrome. */
  quran: `${fonts.quran.replace(' ', '')}-Regular`,
} as const;

/** 8pt grid from tokens. The template's own scale is gone. */
export const Spacing = space;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
