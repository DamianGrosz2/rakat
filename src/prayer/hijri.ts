/**
 * Hijri date, with a regional moon-sighting offset.
 *
 * The Umm al-Qura calendar is arithmetic; actual month starts depend on local
 * sighting, so communities run up to a couple of days apart. `sightingOffsetDays`
 * is the user-facing knob for that (integer, typically -2..+2) and is applied
 * before conversion, not after formatting.
 *
 * Pure TypeScript. @umalqura/core works in local calendar components throughout
 * (its internal anchors are built with `new Date(y, m, d)`), so we hand it a
 * local midnight and stay consistent with it.
 */
import umalqura from '@umalqura/core';

/** Months 1..12, index 0 = Muharram. */
export const HIJRI_MONTHS_LATIN = [
  'Muharram',
  'Safar',
  'Rabiʿ al-Awwal',
  'Rabiʿ al-Thani',
  'Jumada al-Ula',
  'Jumada al-Akhira',
  'Rajab',
  'Shaʿban',
  'Ramadan',
  'Shawwal',
  'Dhu al-Qaʿda',
  'Dhu al-Hijja',
] as const;

export const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

export type HijriDate = {
  readonly year: number;
  /** 1..12 */
  readonly month: number;
  readonly day: number;
  readonly monthLatin: string;
  readonly monthArabic: string;
};

export function hijriDate(date: Date, sightingOffsetDays = 0): HijriDate {
  // Local calendar arithmetic: Date handles month/year rollover, and a DST day
  // (23h or 25h) cannot shunt us onto the neighbouring date the way adding
  // 86_400_000 ms would.
  const shifted = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + Math.trunc(sightingOffsetDays),
  );

  const { hy, hm, hd } = umalqura.$.gregorianToHijri(shifted);

  return {
    year: hy,
    month: hm,
    day: hd,
    monthLatin: HIJRI_MONTHS_LATIN[hm - 1],
    monthArabic: HIJRI_MONTHS_AR[hm - 1],
  };
}

/**
 * e.g. "29 Rabiʿ al-Awwal 1448", or "29 ربيع الأول 1448" in Arabic script.
 * Numerals stay Latin — shaping them to Arabic-Indic digits is a display concern.
 */
export function formatHijri(h: HijriDate, script: 'latin' | 'arabic' = 'latin'): string {
  const month = script === 'arabic' ? h.monthArabic : h.monthLatin;
  return `${h.day} ${month} ${h.year}`;
}
