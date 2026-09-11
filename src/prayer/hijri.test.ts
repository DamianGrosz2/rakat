import { describe, expect, it } from 'vitest';

import {
  formatHijri,
  hijriDate,
  HIJRI_MONTHS_AR,
  HIJRI_MONTHS_LATIN,
} from './hijri';

describe('hijri month names', () => {
  it('ships twelve months in both scripts', () => {
    expect(HIJRI_MONTHS_LATIN).toHaveLength(12);
    expect(HIJRI_MONTHS_AR).toHaveLength(12);
    expect(HIJRI_MONTHS_LATIN[0]).toBe('Muharram');
    expect(HIJRI_MONTHS_LATIN[8]).toBe('Ramadan');
    expect(HIJRI_MONTHS_AR[8]).toBe('رمضان');
  });
});

describe('hijriDate', () => {
  it('converts a known date', () => {
    // 2026-09-11 falls in Rabiʿ al-Awwal 1448.
    const h = hijriDate(new Date(2026, 8, 11));

    expect(h.year).toBe(1448);
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
    expect(h.monthLatin).toBe(HIJRI_MONTHS_LATIN[h.month - 1]);
    expect(h.monthArabic).toBe(HIJRI_MONTHS_AR[h.month - 1]);
  });

  it('is time-of-day independent within a local day', () => {
    const midnight = hijriDate(new Date(2026, 8, 11, 0, 1));
    const evening = hijriDate(new Date(2026, 8, 11, 23, 59));

    expect(evening).toEqual(midnight);
  });

  it('applies the sighting offset in days, in both directions', () => {
    const base = new Date(2026, 8, 11);

    // An offset of n days must equal the unshifted conversion n days away —
    // asserted this way rather than as `day + n`, because `base` can land on the
    // last day of a Hijri month and roll over.
    for (const offset of [-2, -1, 0, 1, 2]) {
      expect(hijriDate(base, offset), `offset ${offset}`).toEqual(
        hijriDate(new Date(2026, 8, 11 + offset), 0),
      );
    }

    // Mid-month, the day number simply moves.
    const midMonth = new Date(2026, 8, 20);
    expect(hijriDate(midMonth, 0).day).toBe(9);
    expect(hijriDate(midMonth, 1).day).toBe(10);
    expect(hijriDate(midMonth, -1).day).toBe(8);
  });

  it('rolls the Hijri month over when the offset crosses a month boundary', () => {
    // Walk a whole Gregorian year and assert the offset is always exactly one
    // Hijri day forward, month/year rollovers included.
    for (let i = 0; i < 365; i++) {
      const day = new Date(2026, 0, 1 + i);
      const plain = hijriDate(day, 0);
      const shifted = hijriDate(day, 1);
      const isSameMonth = shifted.month === plain.month && shifted.year === plain.year;

      if (isSameMonth) {
        expect(shifted.day).toBe(plain.day + 1);
      } else {
        // New month: day resets to 1, and the previous day was the month's last.
        expect(shifted.day).toBe(1);
        expect(plain.day).toBeGreaterThanOrEqual(29);
      }
    }
  });

  it('survives a DST transition without slipping a day', () => {
    // Europe/Berlin springs forward on 2026-03-29 and falls back on 2026-10-25.
    for (const [y, m, d] of [
      [2026, 2, 29],
      [2026, 9, 25],
    ]) {
      const before = hijriDate(new Date(y, m, d - 1));
      const on = hijriDate(new Date(y, m, d));

      expect(on).toEqual(hijriDate(new Date(y, m, d - 1), 1));
      expect(on.day).not.toBe(before.day);
    }
  });

  it('truncates a non-integer offset rather than producing a half day', () => {
    const base = new Date(2026, 8, 11);
    expect(hijriDate(base, 1.9)).toEqual(hijriDate(base, 1));
  });
});

describe('formatHijri', () => {
  it('formats in Latin transliteration by default and in Arabic on request', () => {
    const h = hijriDate(new Date(2026, 8, 11));

    expect(formatHijri(h)).toBe(`${h.day} ${h.monthLatin} ${h.year}`);
    expect(formatHijri(h, 'arabic')).toBe(`${h.day} ${h.monthArabic} ${h.year}`);
    expect(formatHijri(h, 'arabic')).toContain(h.monthArabic);
  });
});
