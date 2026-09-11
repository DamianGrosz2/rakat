/**
 * Writes the widget payload into the shared App Group and asks WidgetKit to
 * reload.
 *
 * This is the only impure part of the widget path — the payload itself is built
 * and tested in `state.ts`. Everything here is iOS-only and a no-op elsewhere;
 * the Android widget is a separate implementation (see HANDOFF.md).
 */

import { Platform } from 'react-native';
import { ExtensionStorage } from '@kingstinct/expo-apple-targets';

import { formatHijri, hijriDate } from '@/prayer/hijri';
import { getMethod } from '@/prayer/methods';
import type { PrayerSettings } from '@/prayer/settings';
import { computePrayerTimes, type Coords } from '@/prayer/times';
import { dailyAyah } from '@/quran/daily-ayah';
import { buildWidgetState, WIDGET_HORIZON_DAYS } from '@/widgets/state';

/** Must match `ios.entitlements` in app.json and `SharedStore.appGroup` in Swift. */
export const APP_GROUP = 'group.com.dadama.rakat';

/** Must match `SharedStore.key` in `targets/widget/RakatWidget.swift`. */
const STATE_KEY = 'widget.state';

const storage = new ExtensionStorage(APP_GROUP);

/**
 * Recompute a week of prayer times and hand them to the widget.
 *
 * Call on every foreground. It is cheap — `adhan` computes a day in
 * microseconds — and writing a week ahead means WidgetKit keeps the widget
 * correct even if the app is not opened again for days. That is deliberate:
 * "the widget doesn't even work" is the category's single most common widget
 * complaint, and it is almost always a refresh-budget problem.
 */
export function publishWidgetState(coords: Coords, settings: PrayerSettings, now = new Date()) {
  if (Platform.OS !== 'ios') return;

  const days = Array.from({ length: WIDGET_HORIZON_DAYS }, (_, i) =>
    computePrayerTimes(
      coords,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + i),
      settings,
    ),
  );

  const method = getMethod(settings.method);
  const ayah = dailyAyah(now);

  const state = buildWidgetState(
    days,
    {
      method: method.name,
      madhab: settings.madhab === 'hanafi' ? 'Hanafi' : 'Shafi',
      hijri: formatHijri(hijriDate(now, settings.hijriOffsetDays)),
    },
    { arabic: ayah.arabic, reference: `${ayah.surah} ${ayah.reference}` },
  );

  storage.set(STATE_KEY, JSON.stringify(state));
  // Reload both widget kinds. Passing no name reloads every timeline in the
  // extension, which is what we want — the two widgets share one Provider.
  ExtensionStorage.reloadWidget();
}

/**
 * Clears the payload. Used when the user removes their location.
 *
 * Written as an empty string rather than removed: this fork's ExtensionStorage
 * has no `remove`, and the Swift side already treats undecodable content as
 * "no data" — it guards the JSON decode and falls back to the placeholder.
 */
export function clearWidgetState() {
  if (Platform.OS !== 'ios') return;
  storage.set(STATE_KEY, '');
  ExtensionStorage.reloadWidget();
}
