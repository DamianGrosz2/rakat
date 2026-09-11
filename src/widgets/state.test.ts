import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../prayer/settings.ts';
import { computePrayerTimes } from '../prayer/times.ts';
import { buildWidgetState, WIDGET_HORIZON_DAYS } from './state.ts';

const BERLIN = { latitude: 52.520008, longitude: 13.404954 };

function week(startYear = 2026, startMonth = 8, startDay = 11) {
  return Array.from({ length: WIDGET_HORIZON_DAYS }, (_, i) =>
    computePrayerTimes(BERLIN, new Date(startYear, startMonth, startDay + i), DEFAULT_SETTINGS),
  );
}

const META = { method: 'DITIB · Diyanet', madhab: 'Hanafi', hijri: '29 Rabiʿ al-Awwal 1448' };
const AYAH = { arabic: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', reference: 'Ash-Sharh 94:6' };

describe('the payload the Swift widget decodes', () => {
  // Swift decodes with a plain JSONDecoder against a struct with these exact
  // property names. A rename here is a silently blank widget, not a crash, so
  // the contract is pinned by a test rather than by hope.
  it('uses exactly the keys WidgetState declares in Swift', () => {
    const state = buildWidgetState(week(), META, AYAH);
    expect(Object.keys(state).sort()).toEqual(['ayah', 'hijri', 'madhab', 'marks', 'method']);
    expect(Object.keys(state.marks[0]).sort()).toEqual(['arabic', 'at', 'isPrayer', 'key', 'latin']);
    expect(Object.keys(state.ayah!).sort()).toEqual(['arabic', 'reference']);
  });

  it('writes epoch SECONDS, not milliseconds', () => {
    // Date(timeIntervalSince1970:) takes seconds. Passing ms puts the next
    // prayer somewhere in the year 58000 and the widget shows nothing.
    const state = buildWidgetState(week(), META, AYAH);
    const first = state.marks[0].at;
    expect(first).toBeGreaterThan(1_700_000_000);
    expect(first).toBeLessThan(2_000_000_000);
  });

  it('serialises to JSON and back unchanged', () => {
    const state = buildWidgetState(week(), META, AYAH);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('the horizon is what keeps the widget correct', () => {
  it('carries a full week of marks so WidgetKit can run unattended', () => {
    const state = buildWidgetState(week(), META, AYAH);
    // 6 marks a day (5 prayers + sunrise) x 7 days.
    expect(state.marks).toHaveLength(6 * WIDGET_HORIZON_DAYS);
  });

  it('is sorted ascending, because Swift takes the first future mark without sorting', () => {
    const times = state_marks();
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('marks sunrise as not-a-prayer so it can never be shown as "next"', () => {
    const state = buildWidgetState(week(), META, AYAH);
    const sunrises = state.marks.filter((m) => m.key === 'sunrise');
    expect(sunrises).toHaveLength(WIDGET_HORIZON_DAYS);
    expect(sunrises.every((m) => m.isPrayer === false)).toBe(true);
    expect(state.marks.filter((m) => m.key !== 'sunrise').every((m) => m.isPrayer)).toBe(true);
  });

  it('carries the Arabic name for every mark, from the single label source', () => {
    const state = buildWidgetState(week(), META, AYAH);
    expect(state.marks.every((m) => m.arabic.length > 0)).toBe(true);
    expect(state.marks.find((m) => m.key === 'fajr')!.arabic).toBe('الفجر');
  });

  it('accepts a missing ayah rather than inventing one', () => {
    const state = buildWidgetState(week(), META, null);
    expect(state.ayah).toBeNull();
  });
});

function state_marks(): number[] {
  return buildWidgetState(week(), META, AYAH).marks.map((m) => m.at);
}
