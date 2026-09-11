/**
 * The three editions bundled in `assets/quran/quran.db`, and the exact credit
 * line each source requires.
 *
 * **`ATTRIBUTION` must be rendered in the UI wherever the corresponding text is
 * shown** — the reader, the daily-ayah card, the widget, any share image. Not
 * once in a settings page: beside the text. Two of the three licences make the
 * credit a condition of the grant, so a screen that shows the text without it is
 * not merely impolite, it is unlicensed.
 *
 * This file is the single list of edition keys. `scripts/build-quran-db.ts`
 * downloads exactly what is here, and `src/quran/verify.test.ts` holds a second,
 * independent copy of the three approved keys and fails if this table drifts from
 * it. The duplication is the point — same pattern as `src/theme/parity.test.ts`.
 *
 * ## Why the key list is dangerous to edit
 *
 * `fawazahmed0/quran-api` mirrors both licence families under near-identical
 * names. Anything sourced from **tanzil.net that is not the Quran text itself**
 * is non-commercial, and this app will have a paid tier. Specific traps, all of
 * which look correct at a glance:
 *
 *   - `deu_asfbubenheimand` — credited to the same two translators as the German
 *     edition below, but sourced from tanzil.net. Non-commercial. Shipping it
 *     would poison the app.
 *   - every `*_la` key — those are Latin transliterations, not translations.
 *   - any Abu Rida / Khoury / Zaidan / Diyanet / Saheeh International edition.
 *
 * See `FORBIDDEN_KEYS` below and `HANDOFF.md` §1.
 */

export type Role = 'arabic' | 'de' | 'en';

export type Edition = {
  /** Edition key in `fawazahmed0/quran-api`. The CDN filename hyphenates it. */
  readonly key: string;
  readonly role: Role;
  /** Author/translator as the upstream index names them. */
  readonly translator: string;
  /** The upstream the edition itself is derived from, not the mirror. */
  readonly source: string;
  /** Retained verbatim — QuranEnc's terms require the version to travel along. */
  readonly version: string;
  readonly licence: string;
  /** The literal string the UI shows beside this text. */
  readonly attribution: string;
};

export const EDITIONS: readonly Edition[] = [
  {
    key: 'ara_quranuthmanihaf',
    role: 'arabic',
    translator: 'King Fahd Glorious Quran Printing Complex',
    source: 'https://qurancomplex.gov.sa/',
    version: 'Uthmani, Hafs an Asim',
    licence: 'KFGQPC terms — free for software; commercial printing restricted. VERIFY: HANDOFF.md §1',
    attribution: 'Quran text: King Fahd Glorious Quran Printing Complex — Uthmani (Hafs)',
  },
  {
    key: 'deu_frankbubenheima',
    role: 'de',
    translator: 'Frank Bubenheim und Nadeem Elyas',
    source: 'https://quranenc.com/check/german_bubenheim/v1.1.0-csv.1',
    version: 'v1.1.0-csv.1',
    licence: 'QuranEnc — republication incl. commercial with attribution, version retained, no ads beside it',
    attribution: 'Bubenheim & Elyas · QuranEnc.com v1.1.0-csv.1',
  },
  {
    key: 'eng_rowwadtranslati',
    role: 'en',
    translator: 'Rowwad Translation Center',
    source: 'https://quranenc.com/en/browse/english_rwwad',
    // QuranEnc publishes no version string for english_rwwad. Recorded as
    // unversioned rather than invented; see the report note.
    version: 'unversioned',
    licence: 'QuranEnc — republication incl. commercial with attribution',
    attribution: 'Rowwad Translation Center · QuranEnc.com',
  },
];

/**
 * Keys that must never appear in `EDITIONS`. Not exhaustive — it cannot be — but
 * it names the ones a person would plausibly reach for by mistake.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  // Tanzil-sourced translations: non-commercial.
  'deu_asfbubenheimand',
  'deu_abualrida',
  'deu_adelkhoury',
  'deu_amirzaidan',
  'eng_saheehinterna',
  // Tafsir, not the mushaf. The name is misleading: "King Fahad Quran Complex"
  // on tanzil.net is al-Tafsir al-Muyassar, undiacritised Arabic commentary.
  'ara_kingfahadquranc',
  // Transliterations, not text.
  'ara_kingfahadquranc_la',
  'ara_quran_la',
];

export const byRole = (role: Role): Edition => {
  const e = EDITIONS.find((x) => x.role === role);
  if (!e) throw new Error(`no edition for role ${role}`);
  return e;
};

/**
 * The CDN URL for an edition. The index keys use `_`; the files use `-`.
 * Getting this wrong returns a 404 body that parses as text, not JSON — which is
 * how a typo would otherwise reach the database as content.
 */
export const editionUrl = (key: string) =>
  `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/${key.replaceAll('_', '-')}.json`;

/** Chapter metadata: names, ayah counts, revelation place. */
export const INFO_URL = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/info.json';
