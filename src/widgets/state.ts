/**
 * The payload the widget extension reads out of the shared App Group.
 *
 * Pure: no Expo imports, so the shape and the multi-day horizon are unit-tested
 * in node. The write itself lives in `bridge.ts`.
 *
 * **This must stay in step with `WidgetState` in `targets/widget/RakatWidget.swift`.**
 * Swift decodes it with a plain `JSONDecoder`, so a renamed key is a silently
 * blank widget, not a crash. The test in `state.test.ts` asserts the key names.
 */

import type { MarkName } from '@/prayer/methods';
import { MARK_LABEL } from '@/prayer/labels';
import type { PrayerTimes } from '@/prayer/times';
import { orderedMarks } from '@/prayer/times';

export type WidgetMark = {
  key: MarkName;
  latin: string;
  arabic: string;
  /** Epoch SECONDS, not milliseconds — Swift's `Date(timeIntervalSince1970:)`. */
  at: number;
  /** Sunrise is shown in the list but can never be "next". */
  isPrayer: boolean;
};

export type WidgetState = {
  method: string;
  madhab: string;
  hijri: string;
  marks: WidgetMark[];
  ayah: { arabic: string; reference: string } | null;
};

/**
 * How many days of marks to write.
 *
 * The widget builds one timeline entry per upcoming prayer, so writing a week
 * means WidgetKit keeps the widget correct for a week *without the app being
 * opened at all*. That is the actual fix for "the widget doesn't even work" —
 * the category's top widget complaint — rather than hoping a single reload
 * lands.
 */
export const WIDGET_HORIZON_DAYS = 7;

export function buildWidgetState(
  days: readonly PrayerTimes[],
  meta: { method: string; madhab: string; hijri: string },
  ayah: { arabic: string; reference: string } | null,
): WidgetState {
  const marks: WidgetMark[] = [];
  for (const day of days) {
    for (const mark of orderedMarks(day)) {
      marks.push({
        key: mark.name,
        latin: MARK_LABEL[mark.name].latin,
        arabic: MARK_LABEL[mark.name].arabic,
        at: Math.floor(mark.time.getTime() / 1000),
        isPrayer: mark.name !== 'sunrise',
      });
    }
  }
  // Ascending, so the widget's `first { $0.date > now }` is correct without
  // sorting on the Swift side.
  marks.sort((a, b) => a.at - b.at);
  return { ...meta, marks, ayah };
}
