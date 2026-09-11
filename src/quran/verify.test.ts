/**
 * The integrity check for the bundled mushaf.
 *
 * This is the most important test in the repository. Everything else here is a
 * feature; this one is the reason the product is allowed to exist. If it fails,
 * read the failure message — it says what to do, and "re-run the build and commit
 * the new manifest" is not it.
 *
 * Runs without a device: `node:sqlite` reads the shipped artefact directly, so CI
 * and a laptop check the same bytes the phone will get.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EDITIONS, FORBIDDEN_KEYS } from '@/quran/attribution';
import { CURATED } from '@/quran/curated';
import { CURATED_COUNT, dailyAyah } from '@/quran/daily-ayah';
import { EXPECTED, driftMessage, readDatabase, textChecksum, type TextField } from '@/quran/verify';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const manifest = JSON.parse(readFileSync(join(root, 'src/quran/checksums.json'), 'utf8')) as {
  editions: { key: string; role: string; translator: string; source: string; version: string; sha256: string }[];
  database: { surahs: number; ayahs: number; arabic: string; de: string; en: string };
};

const { surahs, verses } = readDatabase(join(root, 'assets/quran/quran.db'));

const surah = (n: number) => surahs.find((s) => s.number === n);
const at = (s: number, a: number) => verses.find((v) => v.surah === s && v.ayah === a);

describe('the text has not changed', () => {
  // The whole point. A wrong letter in the mushaf is an existential bug, so the
  // Arabic is checked first and its failure message is the loudest.
  for (const field of ['arabic', 'de', 'en'] as TextField[]) {
    it(`${field} matches the committed checksum`, () => {
      const built = textChecksum(verses, field);
      const committed = manifest.database[field];
      if (built !== committed) throw new Error(driftMessage(field, committed, built));
      expect(built).toBe(committed);
    });
  }
});

describe('structure', () => {
  it('has exactly 114 surahs', () => {
    expect(surahs).toHaveLength(EXPECTED.surahs);
    expect(manifest.database.surahs).toBe(EXPECTED.surahs);
  });

  it('has exactly 6236 ayahs', () => {
    expect(verses).toHaveLength(EXPECTED.ayahs);
    expect(manifest.database.ayahs).toBe(EXPECTED.ayahs);
  });

  it('Al-Fatiha has 7 ayahs', () => {
    expect(surah(1)?.ayahs).toBe(EXPECTED.ayahCounts[1]);
    expect(verses.filter((v) => v.surah === 1)).toHaveLength(7);
  });

  it('Al-Baqarah has 286 ayahs', () => {
    expect(surah(2)?.ayahs).toBe(EXPECTED.ayahCounts[2]);
    expect(verses.filter((v) => v.surah === 2)).toHaveLength(286);
  });

  it('An-Nas is surah 114 and has 6 ayahs', () => {
    const s = surah(114);
    expect(s?.number).toBe(114);
    expect(s?.ayahs).toBe(EXPECTED.ayahCounts[114]);
    expect(s?.latin).toBe('An-Naas');
    expect(verses.filter((v) => v.surah === 114)).toHaveLength(6);
    expect(at(114, 7)).toBeUndefined();
  });

  it("every surah's declared ayah count equals the rows it actually has", () => {
    const actual = new Map<number, number>();
    for (const v of verses) actual.set(v.surah, (actual.get(v.surah) ?? 0) + 1);
    const wrong = surahs.filter((s) => actual.get(s.number) !== s.ayahs);
    expect(wrong.map((s) => s.number)).toEqual([]);
  });

  it('ayahs are numbered 1..n with no gaps', () => {
    const gaps = surahs.filter((s) => {
      const nums = verses.filter((v) => v.surah === s.number).map((v) => v.ayah);
      return nums.some((n, i) => n !== i + 1);
    });
    expect(gaps.map((s) => s.number)).toEqual([]);
  });

  it('no verse is missing text in any of the three editions', () => {
    const blank = verses.filter((v) => !v.arabic.trim() || !v.de.trim() || !v.en.trim());
    expect(blank.map((v) => `${v.surah}:${v.ayah}`)).toEqual([]);
  });

  it('every surah has a revelation place', () => {
    expect([...new Set(surahs.map((s) => s.revelation))].sort()).toEqual(['Madina', 'Mecca']);
  });
});

describe('the Arabic is the mushaf, not something that resembles it', () => {
  it('1:1 is the Basmala verbatim, with full tashkeel', () => {
    expect(at(1, 1)?.arabic).toBe(EXPECTED.basmala);
  });

  it('the Basmala carries its diacritics and its wasla alif', () => {
    const text = at(1, 1)!.arabic;
    // U+0671 ALIF WASLA, U+0670 SUPERSCRIPT ALEF, U+064E FATHA, U+0651 SHADDA.
    // A normalisation pass or a "simple" edition would drop at least one of these,
    // which is how an undiacritised text could otherwise slip in unnoticed.
    for (const cp of ['ٱ', 'ٰ', 'َ', 'ّ', 'ِ']) {
      expect(text).toContain(cp);
    }
  });

  it('At-Tawba does not begin with a Basmala', () => {
    // The one surah without it. A build that prepended the Basmala to every surah
    // would pass the ayah counts and still be wrong here.
    expect(at(9, 1)?.arabic).not.toContain(EXPECTED.basmala);
  });

  it('the Arabic is diacritised throughout, not just in the famous places', () => {
    // Tashkeel, the superscript alef, the Quranic annotation signs and the open
    // tanween forms. An undiacritised edition — which is what the misleadingly
    // named `ara_kingfahadquranc` turned out to be — fails this thousands of
    // times over.
    //
    // Exactly one ayah legitimately carries no mark at all: 20:1, طه. It is one of
    // the muqattaʿat, and the Uthmani text vowels none of it. The other
    // muqattaʿat do carry a maddah (2:1 is الٓمٓ, U+0653 twice), so they are not
    // exceptions. Asserting the exception by name means an edition that quietly
    // strips diacritics cannot hide behind a loose "mostly diacritised" check.
    const marks = /[ً-ٰٟۖ-ࣰۭ-ࣳ]/;
    const bare = verses.filter((v) => !marks.test(v.arabic));
    expect(bare.map((v) => `${v.surah}:${v.ayah}`)).toEqual(['20:1']);
    expect(at(20, 1)?.arabic).toBe('طه');
  });
});

describe('licensing — the edition keys cannot be swapped quietly', () => {
  it('the manifest names exactly the three approved editions', () => {
    expect(manifest.editions.map((e) => e.key)).toEqual([...EXPECTED.editionKeys]);
  });

  it('attribution.ts names exactly the three approved editions', () => {
    // Held apart from EXPECTED on purpose: editing one file must not be able to
    // change what ships. Same tripwire as src/theme/parity.test.ts.
    expect(EDITIONS.map((e) => e.key)).toEqual([...EXPECTED.editionKeys]);
  });

  it('no forbidden edition is anywhere near the build', () => {
    for (const key of FORBIDDEN_KEYS) {
      expect(EDITIONS.map((e) => e.key)).not.toContain(key);
      expect(manifest.editions.map((e) => e.key)).not.toContain(key);
    }
  });

  it('the downloaded payload checksums are recorded', () => {
    for (const e of manifest.editions) expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the German credit carries QuranEnc and the retained version, as its terms require', () => {
    const de = EDITIONS.find((e) => e.role === 'de')!;
    expect(de.version).toBe('v1.1.0-csv.1');
    expect(de.attribution).toContain('QuranEnc.com');
    expect(de.attribution).toContain(de.version);
  });

  it('every edition has a non-empty credit line for the UI to render', () => {
    for (const e of EDITIONS) {
      expect(e.attribution.length).toBeGreaterThan(0);
      expect(e.translator.length).toBeGreaterThan(0);
      expect(e.source).toMatch(/^https:\/\//);
    }
  });
});

describe('the daily ayah comes from the verified database', () => {
  it('every curated verse is byte-identical to the database row', () => {
    // Catches a hand-edit of the generated curated.ts, which would otherwise be
    // unverified Arabic on the home screen with a "verified" marker next to it.
    for (const c of CURATED) {
      const v = at(c.surah, c.ayah);
      expect(v, `${c.surah}:${c.ayah} is not in the database`).toBeDefined();
      expect(v!.arabic).toBe(c.arabic);
      expect(v!.de).toBe(c.de);
      expect(v!.en).toBe(c.en);
      expect(surah(c.surah)?.latin).toBe(c.name);
    }
  });

  it('rotates over 30 verses and is stable for a given date', () => {
    expect(CURATED_COUNT).toBe(30);
    expect(dailyAyah(new Date(2026, 8, 11))).toBe(dailyAyah(new Date(2026, 8, 11, 23, 59)));
    expect(dailyAyah(new Date(2026, 8, 11))).not.toBe(dailyAyah(new Date(2026, 8, 12)));
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => dailyAyah(new Date(2026, 8, 11 + i)).reference),
    );
    expect(seen.size).toBe(30);
  });

  it('is marked verified and credits the source with its version', () => {
    const a = dailyAyah(new Date(2026, 8, 11));
    expect(a.translationVerified).toBe(true);
    expect(a.translator).toContain('QuranEnc.com');
    expect(a.arabic).toBe(at(Number(a.reference.split(':')[0]), Number(a.reference.split(':')[1]))?.arabic);
  });
});
