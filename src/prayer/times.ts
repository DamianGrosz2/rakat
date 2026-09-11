/**
 * The calculation surface.
 *
 * Pure TypeScript — no React/RN/Expo, no network, no analytics. Coordinates never
 * leave this process. Everything runs on device, and the whole module is testable
 * under plain vitest in node.
 */
import {
  Coordinates,
  HighLatitudeRule,
  PolarCircleResolution,
  PrayerTimes as AdhanPrayerTimes,
} from 'adhan';

import { getMethod, PRAYER_NAMES, type MarkName, type PrayerName } from './methods';
import type { PrayerSettings } from './settings';

export type { MarkName, PrayerName, Offsets, MadhabKey, MethodKey } from './methods';
export { MARK_NAMES, PRAYER_NAMES, METHODS, METHOD_LIST, getMethod } from './methods';

export type Coords = { latitude: number; longitude: number };

export type PrayerTimes = {
  /** The five prayers. Keyed by `PrayerName`, which cannot be 'sunrise'. */
  readonly prayers: Readonly<Record<PrayerName, Date>>;
  /**
   * Sunrise ends the Fajr window and is displayed in the list, but it is not a
   * prayer. It lives outside `prayers` on purpose: nothing that iterates the
   * prayers can reach it, and `nextPrayer`/`currentPrayer` cannot return it.
   */
  readonly sunrise: Date;
  /** The local calendar day these times were computed for. */
  readonly date: Date;
  readonly coords: Coords;
  /** Carried so day-relative helpers can recompute neighbouring days. */
  readonly settings: PrayerSettings;
};

export type PrayerMoment = { readonly name: PrayerName; readonly time: Date };

export type Mark = { readonly name: MarkName; readonly time: Date };

/**
 * Resolves the high-latitude rule for these coordinates.
 *
 * Default is 'auto' = adhan's own recommendation, which is SeventhOfTheNight
 * above 48°. That matters: Berlin (52.5°) and Scandinavia are core markets, and
 * in summer the sun never reaches the 18°/17° depression the angle methods ask
 * for. MiddleOfTheNight would then put Fajr around 01:45 and Isha around 00:30
 * in Berlin in June; the seventh-of-the-night rule lands near 03:55 / 22:20,
 * which is what German mosque tables actually print.
 *
 * ADVISOR NOTE: Diyanet/DITIB do not use seventh-of-the-night for European
 * cities — they use aqrab al-ayyam (nearest day on which the angle is reached).
 * adhan has no such rule for the sub-polar case, so DITIB times in Berlin summer
 * will differ from DITIB's published table by more than any per-prayer offset
 * can absorb. This is the single biggest open fidelity question in the engine.
 */
function resolveHighLatitudeRule(settings: PrayerSettings, coords: Coords) {
  if (settings.highLatitudeRule !== 'auto') return settings.highLatitudeRule;
  // adhan's `recommended` tests `latitude > 48`, so it misses the southern
  // hemisphere entirely. Feed it the absolute latitude so Invercargill and
  // Punta Arenas get the same treatment as Tromsø.
  return HighLatitudeRule.recommended(new Coordinates(Math.abs(coords.latitude), coords.longitude));
}

export function computePrayerTimes(
  coords: Coords,
  date: Date,
  settings: PrayerSettings,
): PrayerTimes {
  const params = getMethod(settings.method).build();

  params.madhab = settings.madhab;
  params.highLatitudeRule = resolveHighLatitudeRule(settings, coords);

  // "Match my mosque". adhan sums `adjustments` with the method's own
  // `methodAdjustments` at calculation time, so the user's minutes stack on top
  // of e.g. DITIB's built-in offsets additively instead of replacing them.
  params.adjustments = { ...settings.offsets };

  // Above the polar circle the sun may not rise or set at all, which otherwise
  // yields Invalid Date for every mark. AqrabYaum substitutes the nearest day on
  // which the sun does rise and set, keeping the user's actual location.
  params.polarCircleResolution = PolarCircleResolution.AqrabYaum;

  const t = new AdhanPrayerTimes(new Coordinates(coords.latitude, coords.longitude), date, params);

  // Degenerate high-latitude days need the twilight boundaries clamped.
  //
  // Under the midnight sun the fallback rule leaves only a couple of minutes
  // between Fajr and sunrise (and between Maghrib and Isha) — at Tromsø in June
  // a seventh of the night is about three minutes. The method's own temkin
  // offsets are calibrated for mid latitudes and are larger than that: Turkey
  // alone pulls sunrise 7 minutes earlier and pushes Maghrib 7 minutes later.
  // Applied to a collapsed night they overrun the twilight and hand back a Fajr
  // *after* sunrise or an Isha *before* Maghrib.
  //
  // Those are not prayer times, they are the approximation breaking down, so we
  // collapse the window rather than render an inverted list. Only these two
  // boundaries are clamped; the rest of the day is astronomically ordered and a
  // user's own offsets are left to speak for themselves.
  const sunrise = t.sunrise;
  const maghrib = t.maghrib;
  const fajr = t.fajr > sunrise ? sunrise : t.fajr;
  const isha = t.isha < maghrib ? maghrib : t.isha;

  return {
    prayers: { fajr, dhuhr: t.dhuhr, asr: t.asr, maghrib, isha },
    sunrise,
    date,
    coords,
    settings,
  };
}

/** The six displayed marks in display order, sunrise included. */
export function orderedMarks(times: PrayerTimes): Mark[] {
  return [
    { name: 'fajr', time: times.prayers.fajr },
    { name: 'sunrise', time: times.sunrise },
    { name: 'dhuhr', time: times.prayers.dhuhr },
    { name: 'asr', time: times.prayers.asr },
    { name: 'maghrib', time: times.prayers.maghrib },
    { name: 'isha', time: times.prayers.isha },
  ];
}

/** Same place, same settings, N calendar days away. */
function shiftDays(times: PrayerTimes, days: number): PrayerTimes {
  const d = times.date;
  // Built from local calendar components rather than epoch arithmetic, so DST
  // transitions (23h and 25h days) do not push us onto the wrong date.
  const shifted = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
  );
  return computePrayerTimes(times.coords, shifted, times.settings);
}

/**
 * The next prayer strictly after `now`.
 *
 * After Isha this is tomorrow's Fajr — never undefined. The whole point of the
 * countdown on the home screen is that it keeps counting at 23:00.
 */
export function nextPrayer(times: PrayerTimes, now: Date): PrayerMoment {
  for (const name of PRAYER_NAMES) {
    const time = times.prayers[name];
    if (time > now) return { name, time };
  }
  return { name: 'fajr', time: shiftDays(times, 1).prayers.fajr };
}

/**
 * The prayer whose window `now` falls in.
 *
 * Before today's Fajr that is still yesterday's Isha — the Isha window runs
 * until Fajr, so this too is never undefined.
 */
export function currentPrayer(times: PrayerTimes, now: Date): PrayerMoment {
  for (let i = PRAYER_NAMES.length - 1; i >= 0; i--) {
    const name = PRAYER_NAMES[i];
    const time = times.prayers[name];
    if (time <= now) return { name, time };
  }
  return { name: 'isha', time: shiftDays(times, -1).prayers.isha };
}
