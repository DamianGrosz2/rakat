/**
 * Display names for the six marks, in both scripts.
 *
 * Every Arabic string the app shows for a prayer lives HERE and nowhere else.
 * That is not tidiness: `REVIEW.md` exists because nothing with Arabic on it
 * ships without the reviewer's sign-off, and a reviewer cannot sign off on a
 * string that is copy-pasted into three screens. One file, one review.
 *
 * Rendering rules that apply wherever these are drawn — see DESIGN.md:
 *   - `letterSpacing: 0`, always (use `arabicText()` from `@/hooks/use-theme`)
 *   - one <Text> per line
 *   - Amiri for these; Amiri Quran is for Quranic text only
 */

import type { MarkName } from './methods';

export type MarkLabel = { readonly latin: string; readonly arabic: string };

export const MARK_LABEL: Readonly<Record<MarkName, MarkLabel>> = {
  fajr: { latin: 'Fajr', arabic: 'الفجر' },
  sunrise: { latin: 'Sunrise', arabic: 'الشروق' },
  dhuhr: { latin: 'Dhuhr', arabic: 'الظهر' },
  asr: { latin: 'Asr', arabic: 'العصر' },
  maghrib: { latin: 'Maghrib', arabic: 'المغرب' },
  isha: { latin: 'Isha', arabic: 'العشاء' },
};
