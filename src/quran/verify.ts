/**
 * The integrity check for the bundled mushaf.
 *
 * Pure TypeScript — no React, no React Native, no Expo — so it runs under plain
 * vitest in node. It reads `assets/quran/quran.db` with `node:sqlite` rather than
 * `expo-sqlite`, because the point is to verify the shipped artefact on CI and on
 * a laptop, where no native runtime exists.
 *
 * ## What this defends against
 *
 * A wrong letter in the mushaf is an existential bug for this product. The paths
 * by which one could arrive are all boring: an upstream edition is silently
 * republished, someone re-runs the build and commits the diff without looking,
 * someone hand-edits the database to "fix" something, or someone swaps an edition
 * key for one that looks equivalent and is not.
 *
 * Every one of those changes the checksums below, and every one of them then has
 * to be argued for in a code review rather than slipping through. That is the
 * whole mechanism: the manifest is committed, so the text is a reviewable diff.
 */
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Known-correct values. These are facts about the Quran, not about our build, so
 * they are written here rather than derived from anything.
 */
export const EXPECTED = {
  surahs: 114,
  ayahs: 6236,
  /** surah number -> ayah count, for the three everybody can check from memory. */
  ayahCounts: { 1: 7, 2: 286, 114: 6 } as Record<number, number>,
  /**
   * Al-Fatiha 1:1, Uthmani, full tashkeel. Written out so a normalisation pass
   * (NFC/NFD, a stripped superscript alef, a swapped yeh) fails this comparison.
   *
   * Code points, for anyone checking by hand:
   *   0628 0650 0631 06E1 0645 0650 0020            بِسۡمِ
   *   0671 0644 0644 064E 0651 0647 0650 0020       ٱللَّهِ
   *   0671 0644 0631 064E 0651 062D 06E1 0645 064E 0670 0646 0650 0020  ٱلرَّحۡمَٰنِ
   *   0671 0644 0631 064E 0651 062D 0650 064A 0645 0650                 ٱلرَّحِيمِ
   */
  basmala: 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ',
  /**
   * The three licence-approved edition keys, held here deliberately apart from
   * `src/quran/attribution.ts` so that editing one file cannot quietly change
   * what ships. Same tripwire pattern as `src/theme/parity.test.ts`.
   *
   * Changing this list is a licensing decision, not a refactor. See the danger
   * notes in `attribution.ts` and `HANDOFF.md` §1.
   */
  editionKeys: ['ara_quranuthmanihaf', 'deu_frankbubenheima', 'eng_rowwadtranslati'] as const,
} as const;

export type Verse = { surah: number; ayah: number; arabic: string; de: string; en: string };
export type SurahRow = {
  number: number;
  arabic: string;
  latin: string;
  english: string;
  ayahs: number;
  revelation: string;
};

/** Field of a verse that carries text, and therefore has a committed checksum. */
export type TextField = 'arabic' | 'de' | 'en';

export function readDatabase(path: string): { surahs: SurahRow[]; verses: Verse[] } {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      surahs: db.prepare('SELECT * FROM surahs ORDER BY number').all() as unknown as SurahRow[],
      verses: db.prepare('SELECT * FROM ayahs ORDER BY surah, ayah').all() as unknown as Verse[],
    };
  } finally {
    db.close();
  }
}

/**
 * The checksum the manifest commits to.
 *
 * Taken over the text, not over the .db file: SQLite's page layout is not stable
 * across versions or platforms, so a file hash would flap for reasons that have
 * nothing to do with a letter changing. `scripts/build-quran-db.ts` computes the
 * identical string from the downloaded JSON, so the two agree only if the text
 * survived the trip into the database intact.
 */
export function textChecksum(verses: Verse[], field: TextField): string {
  const canonical = verses.map((v) => `${v.surah}:${v.ayah}\t${v[field]}`).join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * What a person should do when the checksum moved. Written out in full because
 * the tempting fix — re-run the build and commit the new manifest — is exactly
 * the wrong one, and the failure message is the only place that gets read.
 */
export function driftMessage(field: TextField, committed: string, built: string): string {
  const what = field === 'arabic' ? 'ARABIC TEXT OF THE MUSHAF' : `${field.toUpperCase()} TRANSLATION`;
  return [
    ``,
    `  THE BUNDLED ${what} HAS CHANGED.`,
    ``,
    `  assets/quran/quran.db no longer matches src/quran/checksums.json.`,
    `    committed ${committed}`,
    `    built     ${built}`,
    ``,
    field === 'arabic'
      ? `  A wrong letter in the mushaf is an existential bug for this product.`
      : `  A translation carries a licence that requires the version to be tracked.`,
    `  DO NOT update the manifest to make this test pass.`,
    ``,
    `  If you did not mean to change the text:`,
    `      git checkout assets/quran/quran.db src/quran/`,
    ``,
    `  If upstream genuinely republished the edition:`,
    `      1. npm run build:quran`,
    `      2. diff the text ayah by ayah and understand every change`,
    `      3. get the Muslim reviewer's sign-off (REVIEW.md) BEFORE committing`,
    `      4. commit the database and the manifest in the same commit`,
    ``,
  ].join('\n');
}
