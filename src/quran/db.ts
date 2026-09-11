/**
 * The bundled mushaf, read-only.
 *
 * `assets/quran/quran.db` ships as an app asset and is copied into the SQLite
 * directory on first open. Nothing in the app ever writes to it — `query_only` is
 * set on the connection so a stray INSERT fails loudly here rather than producing
 * a device-local database that silently differs from the one we checksummed.
 *
 * Offline-first, per the architecture rules: no network is involved at any point.
 *
 * Attribution: every screen that renders this text must also render the credit
 * lines from `src/quran/attribution.ts`. Two of the three licences make the credit
 * a condition of the grant.
 */
import {
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { EDITIONS } from '@/quran/attribution';

const DATABASE_NAME = 'quran.db';

export type Surah = {
  number: number;
  /** Verbatim from the source index, including the leading "سُوْرَةُ". */
  arabic: string;
  latin: string;
  english: string;
  ayahs: number;
  revelation: 'Mecca' | 'Madina';
};

export type Verse = {
  surah: number;
  ayah: number;
  /** Uthmani, full tashkeel. Amiri Quran, letterSpacing 0, one <Text> per line. */
  arabic: string;
  de: string;
  en: string;
};

let handle: Promise<SQLiteDatabase> | null = null;

/**
 * The open database. Cached, so the asset copy happens once per launch and every
 * caller shares one connection.
 */
export function quran(): Promise<SQLiteDatabase> {
  return (handle ??= open());
}

async function open(): Promise<SQLiteDatabase> {
  // The same call `<SQLiteProvider assetSource={…}>` makes internally. Used
  // directly because the query surface below is not a React component and the
  // widget bridge has no tree to hang a provider in. If expo-sqlite ever drops
  // this export, switch to SQLiteProvider — the semantics are identical.
  //
  // `forceOverwrite` is not optional here. The default is to skip the copy when a
  // file of that name already exists, which means the second release of this app
  // would keep serving the first release's mushaf: a correction to the text would
  // ship, pass CI, and never reach anyone who already had the app installed.
  //
  // ponytail: the price is re-copying ~5 MB from the bundle once per launch, which
  // is a native file copy of a few milliseconds and happens off the critical path.
  // Cheaper than being wrong. If it ever shows up in a launch profile, stamp the
  // checksum into a meta table and only overwrite when it differs.
  await importDatabaseFromAssetAsync(DATABASE_NAME, {
    assetId: require('@/assets/quran/quran.db'),
    forceOverwrite: true,
  });
  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA query_only = ON;');
  return db;
}

export async function listSurahs(): Promise<Surah[]> {
  const db = await quran();
  return db.getAllAsync<Surah>('SELECT * FROM surahs ORDER BY number');
}

export async function surahVerses(surah: number): Promise<Verse[]> {
  const db = await quran();
  return db.getAllAsync<Verse>('SELECT * FROM ayahs WHERE surah = ? ORDER BY ayah', surah);
}

export async function verse(surah: number, ayah: number): Promise<Verse | null> {
  const db = await quran();
  return db.getFirstAsync<Verse>('SELECT * FROM ayahs WHERE surah = ? AND ayah = ?', surah, ayah);
}

/**
 * Substring search over the two translations.
 *
 * Translations only. Searching undiacritised Arabic against a fully diacritised
 * Uthmani text needs a normalised shadow column and a tokeniser that understands
 * the Uthmani orthography; that is its own project and is deliberately not here.
 *
 * ponytail: LIKE over 6236 rows, ~150 chars each — about a megabyte scanned, which
 * is milliseconds on a phone and needs no FTS index in the bundle. The ceiling is
 * case folding: SQLite's LIKE folds ASCII only, so "Ägypten" will not match
 * "ägypten" (mid-word umlauts are unaffected, so most German queries are fine).
 * If search quality is ever complained about, add a folded shadow column in
 * `scripts/build-quran-db.ts` or move to FTS5.
 */
export async function search(query: string, limit = 50): Promise<Verse[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  // Escape the LIKE metacharacters, or a user typing "%" matches the whole Quran.
  const needle = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const db = await quran();
  return db.getAllAsync<Verse>(
    `SELECT * FROM ayahs
      WHERE de LIKE ? ESCAPE '\\' OR en LIKE ? ESCAPE '\\'
      ORDER BY surah, ayah
      LIMIT ?`,
    needle,
    needle,
    limit,
  );
}

/** The credit lines the reader must render. Re-exported so screens need one import. */
export const ATTRIBUTION = EDITIONS.map((e) => e.attribution);
