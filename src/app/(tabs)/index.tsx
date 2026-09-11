import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AyahCard } from '@/components/ayah-card';
import { Screen } from '@/components/screen';
import { markedTap } from '@/hooks/use-haptics';
import { arabicText, tabularNums, useTheme, type Theme } from '@/hooks/use-theme';
import { makeWindow, minuteOfDay } from '@/lock/window';
import { formatHijri, hijriDate } from '@/prayer/hijri';
import { MARK_LABEL } from '@/prayer/labels';
import { getMethod, PRAYER_NAMES, type PrayerName } from '@/prayer/methods';
import { computePrayerTimes, nextPrayer, orderedMarks } from '@/prayer/times';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useTracker } from '@/store/tracker';

/**
 * 24-hour, zero-padded, always. Printed prayer timetables are 24-hour
 * everywhere, and a locale-driven 12-hour format would put "5:15 PM" in a column
 * sized for "17:15" and break the alignment the whole design rests on.
 */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function untilLabel(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `in ${h}h ${mins % 60}m` : `in ${mins}m`;
}

/**
 * The window a prayer is "on time" within: from its own adhan until the next
 * prayer begins — the fiqh definition, and a much better yardstick than the
 * lock's short window for a mark made by hand. Isha runs until Fajr, so its
 * window crosses midnight; `makeWindow` handles that.
 */
function windowForPrayer(prayers: Record<PrayerName, Date>, p: PrayerName) {
  const i = PRAYER_NAMES.indexOf(p);
  const next = PRAYER_NAMES[(i + 1) % PRAYER_NAMES.length];
  return makeWindow(minuteOfDay(prayers[p]), minuteOfDay(prayers[next]));
}

/**
 * Cross-fades its children whenever `token` changes.
 *
 * DESIGN.md allows exactly one piece of motion in this app: a 180ms ease-out
 * cross-fade when a time rolls over, short enough to read as a print refresh
 * rather than an animation. Under Reduce Motion it does nothing at all.
 */
function RollOver({ token, children }: { token: string; children: ReactNode }) {
  const t = useTheme();
  // useMemo, not useRef().current: reading a ref during render is what the
  // React Compiler lint forbids, and the value only needs stable identity.
  const opacity = useMemo(() => new Animated.Value(1), []);
  const [reduceMotion, setReduceMotion] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Never animate the first paint — the screen should be readable at rest.
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: t.motion.crossfadeMs,
      useNativeDriver: true,
    }).start();
  }, [token, reduceMotion, opacity, t.motion.crossfadeMs]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

/** Re-renders on a cadence. 30s, not 1s: nothing on this screen shows seconds. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function PrayerHome() {
  const t = useTheme();
  const s = styles(t);
  const now = useNow();

  const { settings, ready: settingsReady } = useSettings();
  const { location, ready: locationReady, requestDevice } = useLocation();
  const { today, daysConsistent, mark } = useTracker();

  const times = useMemo(() => {
    if (!location) return null;
    return computePrayerTimes(location.coords, now, settings);
  }, [location, settings, now]);

  // useCallback, not a bare arrow: `Date.now()` is impure, and defined inline
  // the compiler cannot prove this is only ever called from an event handler.
  const markPrayer = useCallback(
    (p: PrayerName) => {
      if (!times) return;
      return mark({
        flag: { prayer: p, at: Date.now() },
        window: windowForPrayer(times.prayers, p),
        windowStart: times.prayers[p],
      });
    },
    [mark, times],
  );

  // Nothing method-dependent renders before the stored settings land, so the
  // user never sees default times flip to their own a frame later.
  if (!settingsReady || !locationReady) return <View style={s.screen} />;

  if (!location || !times) {
    return (
      <View style={[s.screen, s.empty]}>
        <Text style={s.emptyTitle}>Where are you praying?</Text>
        <Text style={s.emptyBody}>
          Prayer times need your coordinates. They are read once, stay on this phone, and are never
          sent anywhere.
        </Text>
        <Pressable style={s.primaryBtn} onPress={requestDevice} accessibilityRole="button">
          <Text style={s.primaryBtnText}>Use my location</Text>
        </Pressable>
      </View>
    );
  }

  const next = nextPrayer(times, now);
  const marks = orderedMarks(times);
  const method = getMethod(settings.method);
  const hijri = formatHijri(hijriDate(now, settings.hijriOffsetDays));
  const prayedToday = new Set(today(now).map((m) => m.prayer));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <Screen>
      {/* The method is the reason people switch apps. It is read first and never moves. */}
      <View style={s.meta}>
        <Text style={s.method}>
          {method.name} · {settings.madhab === 'hanafi' ? 'Hanafi' : 'Shafi'}
        </Text>
        <Text style={s.hijri}>{hijri}</Text>
      </View>

      <RollOver token={next.name}>
        <View style={s.nextField}>
          <View>
            <Text style={s.nextLabel}>Next</Text>
            <Text style={s.nextName}>{MARK_LABEL[next.name].latin}</Text>
            <Text style={s.nextTime}>{hhmm(next.time)}</Text>
          </View>
          <View style={s.nextRight}>
            <Text style={arabicText(t, 'display', t.color.accentInk)}>
              {MARK_LABEL[next.name].arabic}
            </Text>
            <Text style={s.nextUntil}>{untilLabel(now, next.time)}</Text>
          </View>
        </View>
      </RollOver>

      <View>
        {marks.map((mark, i) => {
          const markMinutes = mark.time.getHours() * 60 + mark.time.getMinutes();
          const prevMinutes =
            i === 0 ? -1 : marks[i - 1].time.getHours() * 60 + marks[i - 1].time.getMinutes();
          // The "now" rule sits physically between the two rows it falls between.
          const showNowLine = nowMinutes >= prevMinutes && nowMinutes < markMinutes;
          const isSunrise = mark.name === 'sunrise';
          const isNext = mark.name === next.name;
          const done = !isSunrise && prayedToday.has(mark.name);

          return (
            <View key={mark.name}>
              {showNowLine && (
                <View style={s.nowLine}>
                  <Text style={s.nowTag}>{hhmm(now)}</Text>
                  <View style={s.nowRule} />
                </View>
              )}
              <Pressable
                accessibilityRole={isSunrise ? 'text' : 'button'}
                accessibilityLabel={
                  isSunrise
                    ? `Sunrise ${hhmm(mark.time)}`
                    : done
                      ? `${MARK_LABEL[mark.name].latin} marked`
                      : `Mark ${MARK_LABEL[mark.name].latin} as prayed`
                }
                disabled={isSunrise || done}
                onPress={() => {
                  if (isSunrise || done) return;
                  markedTap();
                  markPrayer(mark.name as PrayerName);
                }}
                style={({ pressed }) => [
                  s.row,
                  isNext && s.rowNext,
                  pressed && s.rowPressed,
                ]}>
                <Text style={[s.rowName, done && s.rowMuted, isNext && s.rowNameNext]}>
                  {MARK_LABEL[mark.name].latin}
                </Text>
                <Text style={arabicText(t, 'ui', t.color.inkMuted)}>
                  {MARK_LABEL[mark.name].arabic}
                </Text>
                <Text style={[s.rowTime, done && s.rowMuted, isNext && s.rowNameNext]}>
                  {hhmm(mark.time)}
                  {done ? ' ✓' : ''}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={s.track}>
        <View style={s.marks}>
          {(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((p) => (
            <View key={p} style={[s.mark, prayedToday.has(p) && s.markDone]} />
          ))}
        </View>
        {/* Counts up. Never "you missed", never a streak that breaks. */}
        <Text style={s.consistent}>{daysConsistent} days consistent</Text>
      </View>

      <AyahCard />
    </Screen>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.ground },
    empty: { paddingHorizontal: t.space.lg, gap: t.space.md },
    emptyTitle: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.ink,
    },
    emptyBody: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      lineHeight: 22,
      color: t.color.inkMuted,
    },
    primaryBtn: {
      backgroundColor: t.color.accent,
      borderRadius: t.radius.button,
      paddingVertical: t.space.md,
      alignItems: 'center',
      marginTop: t.space.sm,
    },
    primaryBtnText: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.body,
      color: t.color.accentInk,
    },

    meta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.sm,
      paddingBottom: t.space.md,
    },
    method: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.color.accent,
    },
    hijri: { fontFamily: t.font.latin, fontSize: t.latinSize.label, color: t.color.inkMuted },

    // Breaks the gutter and runs full-bleed: on a printed timetable the header
    // band does too.
    nextField: {
      backgroundColor: t.color.accent,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.lg,
      paddingBottom: t.space.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    nextLabel: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: t.color.accentInk,
      opacity: 0.72,
    },
    nextName: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.accentInk,
      marginTop: t.space.xs,
    },
    nextTime: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.display,
      lineHeight: t.latinSize.display,
      letterSpacing: -1,
      color: t.color.accentInk,
      ...tabularNums,
    },
    nextRight: { alignItems: 'flex-end' },
    nextUntil: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      color: t.color.accentInk,
      opacity: 0.78,
      marginTop: t.space.xs,
      ...tabularNums,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
      paddingHorizontal: t.space.lg,
      // 12, not 8: with 15pt text this is a 44pt row, Apple's minimum touch
      // target. These rows are tappable. See DESIGN.md → Layout.
      paddingVertical: t.space.md,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowNext: { backgroundColor: t.color.surface },
    // No animation, per DESIGN.md — just an honest pressed state so the row
    // reads as tappable on a screen where nothing else is.
    rowPressed: { backgroundColor: t.color.hairline },
    rowName: {
      flex: 1,
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
    },
    rowNameNext: { fontFamily: t.font.latinSemibold },
    rowMuted: { color: t.color.inkMuted },
    rowTime: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      minWidth: 62,
      textAlign: 'right',
      ...tabularNums,
    },

    nowLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.xs,
    },
    nowTag: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1,
      color: t.color.now,
      ...tabularNums,
    },
    nowRule: { flex: 1, height: 1, backgroundColor: t.color.now },

    track: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
    },
    marks: { flexDirection: 'row', gap: t.space.xs + 2 },
    mark: {
      width: 22,
      height: 5,
      borderRadius: t.radius.mark,
      backgroundColor: t.color.hairline,
    },
    markDone: { backgroundColor: t.color.accent },
    consistent: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
    },
  });
