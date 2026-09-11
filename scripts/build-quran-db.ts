/**
 * Builds the bundled mushaf.
 *
 *   npm run build:quran
 *
 * Run with plain `node` — Node 24 strips TypeScript types natively and ships
 * `node:sqlite`, so this needs no ts-node, no tsx, no sqlite dependency.
 *
 * Downloads the three editions named in `src/quran/attribution.ts`, records the
 * SHA-256 of each payload exactly as received, and writes:
 *
 *   assets/quran/quran.db     the bundled database (committed, shipped as an asset)
 *   src/quran/checksums.json  the manifest the integrity test compares against
 *   src/quran/curated.ts      the daily-ayah set, so `dailyAyah()` stays synchronous
 *
 * Idempotent: it re-downloads every time, rebuilds the database from scratch and
 * writes no timestamps, so a second run leaves an identical tree. If the manifest
 * changes, the upstream text changed — and `src/quran/verify.test.ts` will say so
 * loudly on the next `npm test`.
 *
 * Why re-download rather than cache: a stale cache that silently serves the wrong
 * bytes is precisely the failure this pipeline exists to prevent. 6 MB is cheap.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import {
  EDITIONS,
  FORBIDDEN_KEYS,
  INFO_URL,
  editionUrl,
  type Edition,
  type Role,
} from '../src/quran/attribution.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DB_PATH = join(root, 'assets/quran/quran.db');
const MANIFEST_PATH = join(root, 'src/quran/checksums.json');
const CURATED_PATH = join(root, 'src/quran/curated.ts');

/** Known-correct. The Quran has not changed; if these do not hold, we did. */
const EXPECTED_SURAHS = 114;
const EXPECTED_AYAHS = 6236;

/**
 * The daily-ayah rotation: short, encouraging, uncontroversial. Thirty so the
 * cycle is a month rather than a week, and every one of them is a verse a person
 * is likely to already know.
 *
 * Product choice, not a technical one — an advisor should have an opinion on this
 * list. Tracked as an open item in the build report.
 */
const CURATED_REFS = [
  '2:152', '2:153', '2:186', '2:286', '3:139', '3:173', '3:200', '8:46',
  '9:51', '10:62', '12:87', '13:28', '14:7', '16:97', '16:128', '20:46',
  '25:74', '29:69', '33:3', '39:53', '40:60', '47:7', '55:60', '64:11',
  '65:3', '92:7', '93:5', '93:7', '94:5', '94:6',
] as const;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * The canonical serialization a text checksum is taken over.
 *
 * Deliberately NOT the .db file bytes: SQLite page layout is not stable across
 * versions or platforms, so a file hash would flap for reasons that have nothing
 * to do with the text. This form changes only when a letter changes.
 */
const canonical = (verses: Verse[]) =>
  verses.map((v) => `${v.chapter}:${v.verse}\t${v.text}`).join('\n');

type Verse = { chapter: number; verse: number; text: string };
type Downloaded = {
  edition: Edition;
  url: string;
  bytes: number;
  sha256: string;
  quran: Verse[];
};
type Chapter = {
  chapter: number;
  name: string;
  englishname: string;
  arabicname: string;
  revelation: string;
  verses: unknown[];
};

/**
 * jsDelivr rate-limits with a 403 that its own edge then caches for 60 seconds
 * (`cache-control: s-maxage=60`), so a fast retry just re-reads the cached
 * refusal. Back off past the TTL or do not bother backing off at all.
 */
async function fetchJson(url: string, attempt = 1): Promise<{ body: string; json: any }> {
  const res = await fetch(url);
  if (!res.ok) {
    if (attempt < 5) {
      const wait = 20_000 * attempt;
      console.log(`  ${res.status} for ${url} — retrying in ${wait / 1000}s (attempt ${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${res.status} ${res.statusText} for ${url} (after ${attempt} attempts): ${await res.text()}`);
  }
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    // jsDelivr answers a bad path with a plain-text 200. Without this check the
    // error surfaces much later, as missing text in the database.
    throw new Error(`${url} did not return JSON. First 120 bytes:\n${body.slice(0, 120)}`);
  }
  return { body, json };
}

function assertEditionsAllowed() {
  const keys = EDITIONS.map((e) => e.key);
  const banned = keys.filter((k) => FORBIDDEN_KEYS.includes(k));
  if (banned.length) {
    throw new Error(
      `REFUSING TO BUILD. src/quran/attribution.ts names a forbidden edition: ${banned.join(', ')}.\n` +
        `See the licence notes in that file — these are non-commercial or are not the mushaf.`,
    );
  }
  const distinct = keys.length === new Set(keys).size && EDITIONS.length === 3;
  if (!distinct) throw new Error('EDITIONS must be exactly three distinct editions.');
}

async function main() {
  assertEditionsAllowed();

  console.log('downloading…');
  const info = (await fetchJson(INFO_URL)).json as { verses: { count: number }; chapters: Chapter[] };

  // Sequential on purpose: three parallel multi-megabyte requests is what trips
  // jsDelivr's rate limiter in the first place.
  const downloaded: Downloaded[] = [];
  for (const e of EDITIONS) {
    const url = editionUrl(e.key);
    const { body, json } = await fetchJson(url);
    const quran = json.quran as Verse[];
    if (!Array.isArray(quran)) throw new Error(`${url}: no .quran array`);
    // Buffer.byteLength, not String#length: the Arabic edition is ~1.3M UTF-16
    // code units but ~2.0M UTF-8 bytes, and the manifest records what was sent.
    const bytes = Buffer.byteLength(body, 'utf8');
    console.log(`  ${e.key.padEnd(20)} ${String(bytes).padStart(9)} bytes  ${quran.length} ayat`);
    downloaded.push({ edition: e, url, bytes, sha256: sha256(body), quran });
  }

  // Every edition must agree on shape and ordering before anything is written.
  const base = downloaded[0].quran;
  for (const d of downloaded) {
    if (d.quran.length !== EXPECTED_AYAHS) {
      throw new Error(`${d.edition.key} has ${d.quran.length} ayat, expected ${EXPECTED_AYAHS}`);
    }
    const misaligned = d.quran.findIndex(
      (v, i) => v.chapter !== base[i].chapter || v.verse !== base[i].verse,
    );
    if (misaligned >= 0) {
      throw new Error(
        `${d.edition.key} is not in the same ayah order as ${downloaded[0].edition.key} ` +
          `(first divergence at index ${misaligned}). Refusing to pair text with the wrong verse.`,
      );
    }
    const empty = d.quran.findIndex((v) => !v.text?.trim());
    if (empty >= 0) throw new Error(`${d.edition.key} has empty text at ${base[empty].chapter}:${base[empty].verse}`);
  }
  if (info.chapters.length !== EXPECTED_SURAHS) {
    throw new Error(`info.json has ${info.chapters.length} chapters, expected ${EXPECTED_SURAHS}`);
  }

  const text = (role: Role) => downloaded.find((d) => d.edition.role === role)!.quran;
  const [ar, de, en] = [text('arabic'), text('de'), text('en')];

  // ── database ──────────────────────────────────────────────────────────────
  mkdirSync(dirname(DB_PATH), { recursive: true });
  rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);

  // `WITHOUT ROWID` with PRIMARY KEY (surah, ayah) *is* the (surah, ayah) index —
  // the rows are stored in that order, so a surah read is one sequential scan and
  // there is no second b-tree to carry in the bundle.
  db.exec(`
    CREATE TABLE surahs (
      number     INTEGER PRIMARY KEY,
      arabic     TEXT NOT NULL,
      latin      TEXT NOT NULL,
      english    TEXT NOT NULL,
      ayahs      INTEGER NOT NULL,
      revelation TEXT NOT NULL CHECK (revelation IN ('Mecca', 'Madina'))
    );
    CREATE TABLE ayahs (
      surah  INTEGER NOT NULL REFERENCES surahs(number),
      ayah   INTEGER NOT NULL,
      arabic TEXT NOT NULL,
      de     TEXT NOT NULL,
      en     TEXT NOT NULL,
      PRIMARY KEY (surah, ayah)
    ) WITHOUT ROWID;
  `);

  const insertSurah = db.prepare(
    'INSERT INTO surahs (number, arabic, latin, english, ayahs, revelation) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertAyah = db.prepare('INSERT INTO ayahs (surah, ayah, arabic, de, en) VALUES (?, ?, ?, ?, ?)');

  db.exec('BEGIN');
  for (const c of info.chapters) {
    // Names are stored verbatim as upstream publishes them, including the leading
    // "سُوْرَةُ". Trimming Arabic is a transform, and every transform on Arabic is a
    // review surface; the UI can drop the word if it wants to.
    insertSurah.run(c.chapter, c.arabicname, c.name, c.englishname, c.verses.length, c.revelation);
  }
  for (let i = 0; i < ar.length; i++) {
    insertAyah.run(ar[i].chapter, ar[i].verse, ar[i].text, de[i].text, en[i].text);
  }
  db.exec('COMMIT');
  db.exec('VACUUM');

  const counted = {
    surahs: (db.prepare('SELECT COUNT(*) n FROM surahs').get() as { n: number }).n,
    ayahs: (db.prepare('SELECT COUNT(*) n FROM ayahs').get() as { n: number }).n,
  };
  const perSurah = db
    .prepare('SELECT s.number, s.ayahs, COUNT(a.ayah) actual FROM surahs s JOIN ayahs a ON a.surah = s.number GROUP BY s.number')
    .all() as { number: number; ayahs: number; actual: number }[];
  const wrong = perSurah.filter((r) => r.ayahs !== r.actual);
  if (wrong.length) {
    throw new Error(`ayah counts disagree with info.json for surah(s) ${wrong.map((w) => w.number).join(', ')}`);
  }

  // ── curated set ───────────────────────────────────────────────────────────
  const byRef = new Map(ar.map((v, i) => [`${v.chapter}:${v.verse}`, i]));
  const latin = new Map(info.chapters.map((c) => [c.chapter, c.name]));
  const curated = CURATED_REFS.map((ref) => {
    const i = byRef.get(ref);
    if (i === undefined) throw new Error(`curated ref ${ref} is not a verse`);
    return {
      surah: ar[i].chapter,
      ayah: ar[i].verse,
      name: latin.get(ar[i].chapter)!,
      arabic: ar[i].text,
      de: de[i].text,
      en: en[i].text,
    };
  });

  writeFileSync(
    CURATED_PATH,
    `// GENERATED by npm run build:quran — do not edit by hand.
//
// The daily-ayah rotation, lifted verbatim out of assets/quran/quran.db so
// \`dailyAyah()\` can stay synchronous (its callers — the ayah card and the widget
// bridge — are both sync). \`src/quran/verify.test.ts\` re-reads the database and
// fails if a single character here has drifted from it.

export type CuratedAyah = {
  readonly surah: number;
  readonly ayah: number;
  /** Transliterated surah name, as the upstream index spells it. */
  readonly name: string;
  readonly arabic: string;
  readonly de: string;
  readonly en: string;
};

export const CURATED: readonly CuratedAyah[] = ${JSON.stringify(curated, null, 2)};
`,
  );

  // ── manifest ──────────────────────────────────────────────────────────────
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        _: 'GENERATED by npm run build:quran. Committed on purpose: src/quran/verify.test.ts compares the built database against it, so a changed checksum is a reviewable diff rather than a silent text change.',
        editions: downloaded.map((d) => ({
          key: d.edition.key,
          role: d.edition.role,
          translator: d.edition.translator,
          source: d.edition.source,
          version: d.edition.version,
          url: d.url,
          bytes: d.bytes,
          sha256: d.sha256,
        })),
        // Checksums of the text as it sits in the database, in canonical form.
        // These are what the integrity test actually asserts.
        database: {
          surahs: counted.surahs,
          ayahs: counted.ayahs,
          arabic: sha256(canonical(ar)),
          de: sha256(canonical(de)),
          en: sha256(canonical(en)),
        },
      },
      null,
      2,
    ) + '\n',
  );

  db.close();

  const { size } = statSync(DB_PATH);
  console.log(`\nwrote assets/quran/quran.db  ${(size / 1e6).toFixed(2)} MB`);
  console.log(`     ${counted.surahs} surahs, ${counted.ayahs} ayahs`);
  console.log(`     ${curated.length} curated ayat -> src/quran/curated.ts`);
  console.log('     manifest -> src/quran/checksums.json');
  if (counted.surahs !== EXPECTED_SURAHS || counted.ayahs !== EXPECTED_AYAHS) {
    throw new Error(`expected ${EXPECTED_SURAHS} surahs and ${EXPECTED_AYAHS} ayahs`);
  }
}

await main();
