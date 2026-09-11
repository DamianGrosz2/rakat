/**
 * The daily ayah.
 *
 * Thirty short, encouraging verses, rotating by date. The text is not written
 * here — it is lifted out of the checksummed database at build time into
 * `src/quran/curated.ts`, so the verse on the card is the same text as the verse
 * in the reader, and `src/quran/verify.test.ts` fails if the two ever diverge.
 *
 * **Synchronous on purpose.** Both callers are synchronous — `AyahCard` renders
 * it during render, and `publishWidgetState` writes it into the App Group inside
 * a plain function — so the curated set is loaded eagerly as a module rather than
 * queried. Thirty verses is about 12 KB; the full 6236 stay in SQLite.
 *
 * Every Arabic string the app shows still lives in three files so the reviewer can
 * sign off on all of it. See REVIEW.md.
 */

import { byRole } from '@/quran/attribution';
import { CURATED } from '@/quran/curated';

export type Ayah = {
  /** Verbatim Uthmani text, full tashkeel. Rendered in Amiri Quran, letterSpacing 0. */
  readonly arabic: string;
  readonly surah: string;
  readonly reference: string;
  readonly translation: string;
  /** Shown with the translation. QuranEnc's terms require source and version. */
  readonly translator: string;
  /**
   * UNVERIFIED translations must carry this until checked byte-for-byte against
   * the source edition. The UI shows a marker while it is true, so an unverified
   * line can never quietly pass for a real one.
   */
  readonly translationVerified: boolean;
};

/** Carries the publisher and the retained version, which QuranEnc's terms require. */
const GERMAN = byRole('de');

const AYAHS: readonly Ayah[] = CURATED.map((c) => ({
  arabic: c.arabic,
  surah: c.name,
  reference: `${c.surah}:${c.ayah}`,
  translation: c.de,
  translator: GERMAN.attribution,
  // True because this text came out of assets/quran/quran.db, whose checksum is
  // committed in src/quran/checksums.json and asserted on every `npm test`. It is
  // no longer someone's recollection of a translation.
  translationVerified: true,
}));

/**
 * The verse for a given day.
 *
 * Keyed on the local calendar date, so it turns over at midnight where the user
 * is and not at some UTC boundary in the middle of their evening.
 */
export function dailyAyah(date: Date = new Date()): Ayah {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return AYAHS[((day % AYAHS.length) + AYAHS.length) % AYAHS.length];
}

/** Exposed for the integrity test; nothing in the app should need the whole set. */
export const CURATED_COUNT = AYAHS.length;
