/**
 * Institution presets, by name.
 *
 * Users pick their institution ("DITIB", "IGMG"), not an angle pair. Every preset
 * therefore carries a `params` string that the UI prints next to the name so the
 * user can see the actual numbers — that transparency is the trust signal.
 *
 * Pure TypeScript on purpose: no React/RN/Expo imports anywhere under src/prayer,
 * so the whole engine is unit-testable in node and OTA-patchable via EAS Update.
 */
import { CalculationMethod, CalculationParameters } from 'adhan';

/** The five obligatory prayers. Sunrise is deliberately NOT in here. */
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Everything we display, in display order. Sunrise is a mark, not a prayer. */
export type MarkName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const satisfies readonly PrayerName[];

export const MARK_NAMES = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
] as const satisfies readonly MarkName[];

/** Signed minute offsets, one per displayed mark. */
export type Offsets = Record<MarkName, number>;

export const NO_OFFSETS: Offsets = {
  fajr: 0,
  sunrise: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};

export type MadhabKey = 'shafi' | 'hanafi';

export type MethodKey =
  | 'ditib'
  | 'igmg'
  | 'isna'
  | 'mwl'
  | 'ummalqura'
  | 'egyptian'
  | 'karachi'
  | 'jafari';

export type MethodPreset = {
  /** Stable key. Persisted in settings — never rename one of these. */
  readonly key: MethodKey;
  readonly name: string;
  /** Human-readable parameter summary shown next to the name in the UI. */
  readonly params: string;
  readonly build: () => CalculationParameters;
};

/**
 * Adds `delta` minutes on top of whatever the method already declares, per prayer.
 *
 * adhan keeps two independent tables and sums them at calculation time:
 *   `methodAdjustments` (the institution's own correction) + `adjustments` (the user's).
 * We put institution deltas here and leave `adjustments` free for the user's
 * "match my mosque" offsets, so the two compose additively without fighting.
 */
export function withOffsets(params: CalculationParameters, delta: Offsets): CalculationParameters {
  params.methodAdjustments = {
    fajr: params.methodAdjustments.fajr + delta.fajr,
    sunrise: params.methodAdjustments.sunrise + delta.sunrise,
    dhuhr: params.methodAdjustments.dhuhr + delta.dhuhr,
    asr: params.methodAdjustments.asr + delta.asr,
    maghrib: params.methodAdjustments.maghrib + delta.maghrib,
    isha: params.methodAdjustments.isha + delta.isha,
  };
  return params;
}

/**
 * DITIB correction on top of adhan's `Turkey` preset.
 *
 * WHY Turkey + offsets at all: no library ships a real DITIB preset. DITIB is
 * Diyanet's German branch and republishes Diyanet's times, and adhan's `Turkey`
 * is an *approximation* of Diyanet reverse-engineered against Turkish cities:
 * 18°/17° plus its own per-prayer offsets (sunrise -7, dhuhr +5, asr +4,
 * maghrib +7) that stand in for Diyanet's temkin margins. Offsets are therefore
 * how we close the remaining gap, and this table is the single place to do it.
 *
 * WHY it is currently all zeros: a residual delta has to be measured against
 * DITIB's own published tables, not guessed. Invented minutes would be wrong
 * prayer times shipped with false confidence, which is strictly worse than
 * shipping Turkey's documented approximation unchanged. The seam exists so a
 * verified correction is a pure data change, shippable over the air.
 *
 * ADVISOR NOTE: before tuning these, see the high-latitude caveat in times.ts —
 * for Berlin in summer the high-latitude rule moves Fajr/Isha by far more than
 * any per-prayer minute offset will.
 */
export const DITIB_OFFSETS: Offsets = {
  fajr: 0,
  sunrise: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};

export const METHODS: Readonly<Record<MethodKey, MethodPreset>> = {
  ditib: {
    key: 'ditib',
    name: 'DITIB · Diyanet',
    params: '18° / 17° + offsets',
    build: () => withOffsets(CalculationMethod.Turkey(), DITIB_OFFSETS),
  },
  igmg: {
    key: 'igmg',
    name: 'IGMG',
    params: '18° / 17°',
    build: () => {
      // No library ships an IGMG preset, so these are custom parameters.
      // Numerically the angles match MWL; the +1 min on Dhuhr is the standard
      // safety margin past true zawal that published tables (MWL, ISNA, Egypt,
      // Karachi and Diyanet alike) all apply, so praying on the printed minute
      // is never before zawal. ADVISOR: confirm against an IGMG table.
      const params = new CalculationParameters(null, 18, 17);
      params.methodAdjustments = { ...params.methodAdjustments, dhuhr: 1 };
      return params;
    },
  },
  isna: {
    key: 'isna',
    name: 'ISNA',
    params: '15° / 15°',
    build: () => CalculationMethod.NorthAmerica(),
  },
  mwl: {
    key: 'mwl',
    name: 'Muslim World League',
    params: '18° / 17°',
    build: () => CalculationMethod.MuslimWorldLeague(),
  },
  ummalqura: {
    key: 'ummalqura',
    name: 'Umm al-Qura',
    params: '18.5° / Isha +90 min',
    build: () => CalculationMethod.UmmAlQura(),
  },
  egyptian: {
    key: 'egyptian',
    name: 'Egyptian General Authority',
    params: '19.5° / 17.5°',
    build: () => CalculationMethod.Egyptian(),
  },
  karachi: {
    key: 'karachi',
    name: 'University of Karachi',
    params: '18° / 18°',
    build: () => CalculationMethod.Karachi(),
  },
  jafari: {
    key: 'jafari',
    name: 'Shia Ithna-Ashari (Jafari)',
    params: '16° / 14° · Maghrib 4°',
    build: () => {
      // WHY custom and not adhan's `Tehran`: Tehran is the Institute of
      // Geophysics (University of Tehran) convention at 17.7°/14°, a different
      // institution from the Jafari / Leva Institute (Qum) convention at
      // 16°/14°. They are not interchangeable — Tehran's Fajr runs several
      // minutes earlier at mid latitudes.
      //
      // Maghrib 4° is part of the Jafari definition, not an embellishment: the
      // Shia Ithna-Ashari convention starts Maghrib at ~4° solar depression
      // rather than at sunset. Omitting it would silently hand Jafari users the
      // Sunni Maghrib, i.e. a prayer time several minutes too early.
      // adhan only applies the angle when it falls between sunset and Isha, so
      // it degrades safely at high latitude.
      return new CalculationParameters(null, 16, 14, 0, 4);
    },
  },
};

/** Presets in UI order (insertion order of METHODS). */
export const METHOD_LIST: readonly MethodPreset[] = Object.values(METHODS);

export function isMethodKey(key: unknown): key is MethodKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(METHODS, key);
}

/**
 * Throws on an unknown key rather than falling back to a default.
 *
 * A settings blob that names a method we cannot build is a bug the user must be
 * told about; silently computing with some other institution's angles is the one
 * failure mode this module exists to prevent.
 */
export function getMethod(key: MethodKey): MethodPreset {
  if (!isMethodKey(key)) {
    throw new Error(`Unknown prayer calculation method: ${String(key)}`);
  }
  return METHODS[key];
}
