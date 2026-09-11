import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '@/components/screen';
import { arabicText, tabularNums, useTheme, type Theme } from '@/hooks/use-theme';
import { dayKey, makeWindow, minuteOfDay } from '@/lock/window';
import { MARK_LABEL } from '@/prayer/labels';
import { PRAYER_NAMES, type PrayerName } from '@/prayer/methods';
import { computePrayerTimes } from '@/prayer/times';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useTracker } from '@/store/tracker';
import { currentPeriod, isExcluded, periodDayCount } from '@/tracker/menses';
import { PACES, qadaPlan } from '@/tracker/qada';

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

const shortDate = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * The window a prayer is "on time" within: from its own adhan until the next
 * prayer begins. That is the fiqh definition of the prayer's window, and it is
 * the right yardstick for a mark made by hand here — the lock's own window is
 * much shorter (30 min by default) and would file an otherwise valid Asr at
 * 16:00 as late.
 *
 * Isha runs until Fajr, so its window crosses midnight. `makeWindow` handles
 * that: duration is computed as `(end - start + 1440) % 1440`.
 */
function windowForPrayer(prayers: Record<PrayerName, Date>, p: PrayerName) {
  const i = PRAYER_NAMES.indexOf(p);
  const next = PRAYER_NAMES[(i + 1) % PRAYER_NAMES.length];
  return makeWindow(minuteOfDay(prayers[p]), minuteOfDay(prayers[next]));
}

export default function Tracker() {
  const t = useTheme();
  const s = styles(t);
  const now = useMemo(() => new Date(), []);
  const [editingBacklog, setEditingBacklog] = useState(false);

  const { settings, ready: settingsReady } = useSettings();
  const { location } = useLocation();
  const {
    state,
    menses,
    qada: qadaState,
    ready,
    mark,
    today,
    daysConsistent,
    beginPeriod,
    finishPeriod,
    prayedOneBack,
    adjustBacklog,
    setPace,
  } = useTracker();

  const times = useMemo(
    () => (location ? computePrayerTimes(location.coords, now, settings) : null),
    [location, settings, now],
  );

  const period = currentPeriod(menses);
  const pausedToday = isExcluded(menses, now, now);
  const qada = useMemo(
    () => qadaPlan({ qada: qadaState, tracker: state, menses, today: now }),
    [qadaState, state, menses, now],
  );

  /** The last seven days, oldest first. Excluded days carry no count at all. */
  const week = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = dayKey(date);
      days.push({
        key,
        date,
        paused: isExcluded(menses, key, now),
        marked: PRAYER_NAMES.filter((p) => state.marks[`${key}:${p}`]).length,
      });
    }
    return days;
  }, [state, menses, now]);

  if (!settingsReady || !ready) return <View style={s.screen} />;

  const marked = new Map(today(now).map((m) => [m.prayer, m]));

  return (
    <Screen contentStyle={{ paddingTop: t.space.md }}>
      <Text style={s.h1}>Today</Text>

      <View style={s.group}>
        {PRAYER_NAMES.map((p) => {
          const hit = marked.get(p);
          const time = times?.prayers[p];
          return (
            <TouchableOpacity
              key={p}
              style={[s.row, hit && s.rowDone]}
              disabled={!time || !!hit || pausedToday}
              accessibilityRole="button"
              accessibilityLabel={
                hit
                  ? `${MARK_LABEL[p].latin} marked ${hit.onTime ? 'on time' : 'late'}`
                  : pausedToday
                    ? `${MARK_LABEL[p].latin}, paused today`
                    : `Mark ${MARK_LABEL[p].latin} as prayed`
              }
              onPress={() => {
                if (!time || !times) return;
                mark({
                  flag: { prayer: p, at: Date.now() },
                  window: windowForPrayer(times.prayers, p),
                  windowStart: time,
                });
              }}>
              <Text style={[s.name, hit && s.nameDone]}>{MARK_LABEL[p].latin}</Text>
              <Text style={arabicText(t, 'ui', hit ? t.color.accentInk : t.color.inkMuted)}>
                {MARK_LABEL[p].arabic}
              </Text>
              <Text style={[s.time, hit && s.nameDone]}>
                {time ? hhmm(time) : '—'}
                {hit ? (hit.onTime ? '  ✓' : '  ✓ late') : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {pausedToday && (
        <Text style={s.note}>
          Today is paused. Marking is off, and the day is left out of the count.
        </Text>
      )}

      {!location && (
        <Text style={s.note}>
          Set your location in Settings to see today&rsquo;s times beside each prayer. You can still
          mark prayers without it.
        </Text>
      )}

      {/*
        A paused day gets its own neutral mark, never a gap and never a zero —
        and never the `now` hue, which belongs to the present moment on the
        timetable and to nothing else (DESIGN.md).
      */}
      <Text style={s.section}>This week</Text>
      <View style={s.week}>
        {week.map((d) => (
          <View key={d.key} style={s.day}>
            <Text style={s.dayLabel}>
              {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </Text>
            <View
              style={[s.dayMark, d.paused && s.dayPaused, d.marked === 5 && s.dayFull]}
              accessible
              accessibilityLabel={
                d.paused
                  ? `${longDate(d.date)}, paused, not counted`
                  : `${longDate(d.date)}, ${d.marked} of five marked`
              }>
              <Text
                style={[
                  s.dayCount,
                  d.paused && s.dayCountPaused,
                  d.marked === 5 && s.dayCountFull,
                ]}>
                {d.paused ? '—' : d.marked === 0 ? '·' : d.marked}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={s.note}>
        Five marks fill a day. Shaded days are paused and are not counted either way.
      </Text>

      <Text style={s.section}>Menses</Text>
      <View style={s.group}>
        <View style={s.row}>
          <Text style={s.name}>I&rsquo;m on my period</Text>
          <Switch
            value={!!period}
            onValueChange={(next) => (next ? beginPeriod() : finishPeriod())}
            trackColor={{ true: t.color.accent, false: t.color.hairline }}
            accessibilityLabel="Menses mode"
          />
        </View>
        {period && (
          <View style={s.row}>
            <Text style={s.name}>Started {shortDate(period.start)}</Text>
            <Text style={s.rowParams}>
              Day {periodDayCount(period, now)}
            </Text>
          </View>
        )}
      </View>
      <Text style={s.note}>
        {period
          ? 'Paused since you turned this on. The tracker and the app lock stay off until you turn it back off. These days are left out of the count, and the prayers are not made up later — nothing from them is added below.'
          : 'While this is on, the tracker pauses and the app lock writes no schedules. Those days are left out of the count rather than counted against you, and the prayers missed during menses are not made up later — nothing from them is ever added below. Kept on this phone, like everything else here.'}
      </Text>

      {/*
        Qada' framed as progress toward finishing, never as a figure looming.
        The big number is what has been MADE UP; what is left is the smaller one
        beside it, and it always comes with a date on which it ends.
      */}
      <Text style={s.section}>Making up prayers</Text>

      {qada.done && !editingBacklog ? (
        <>
          <View style={s.group}>
            <View style={s.row}>
              <Text style={s.name}>Nothing to make up</Text>
              {qada.madeUp > 0 && <Text style={s.rowParams}>{qada.madeUp} made up so far</Text>}
            </View>
          </View>
          <Text style={s.note}>
            If you have prayers to make up from before, add them and pick a pace — you will see the
            day you finish.
          </Text>
        </>
      ) : (
        <>
          {/* Nothing at all to show yet — the editor below is the whole point. */}
          {(qada.owed > 0 || qada.madeUp > 0) && (
            <>
              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={s.statValue}>{qada.madeUp}</Text>
                  <Text style={s.statLabel}>made up</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statValue}>{qada.owed}</Text>
                  <Text style={s.statLabel}>left</Text>
                </View>
              </View>

              <View
                style={s.bar}
                accessible
                accessibilityLabel={`${Math.round(qada.progress * 100)} percent made up`}>
                <View style={[s.barFill, { flex: Math.max(0.001, qada.progress) }]} />
                <View style={{ flex: Math.max(0.001, 1 - qada.progress) }} />
              </View>

              <Text style={s.note}>
                {qada.finish
                  ? `At this pace you finish on ${longDate(qada.finish)}.`
                  : 'Nothing left to make up.'}
              </Text>

              <View style={s.paces}>
                {PACES.map((p) => {
                  const selected = p.perWeek === qada.perWeek;
                  return (
                    <TouchableOpacity
                      key={p.perWeek}
                      style={[s.pace, selected && s.paceSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Pace: ${p.label}`}
                      onPress={() => setPace(p.perWeek)}>
                      <Text style={[s.paceLabel, selected && s.paceLabelSelected]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <View style={[s.group, { marginTop: t.space.lg }]}>
            {PRAYER_NAMES.map((p) => {
              const left = qada.byPrayer[p];
              return (
                <View key={p} style={s.row}>
                  <Text style={s.name}>{MARK_LABEL[p].latin}</Text>
                  <Text style={arabicText(t, 'ui', t.color.inkMuted)}>{MARK_LABEL[p].arabic}</Text>
                  {editingBacklog ? (
                    <View style={s.stepper}>
                      <TouchableOpacity
                        disabled={left === 0}
                        accessibilityRole="button"
                        accessibilityLabel={`One fewer ${MARK_LABEL[p].latin} to make up`}
                        onPress={() => adjustBacklog(p, -1)}>
                        <Text style={[s.stepBtn, left === 0 && s.stepBtnOff]}>−</Text>
                      </TouchableOpacity>
                      <Text style={s.stepValue}>{left}</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`One more ${MARK_LABEL[p].latin} to make up`}
                        onPress={() => adjustBacklog(p, 1)}>
                        <Text style={s.stepBtn}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={s.left}>{left}</Text>
                      <TouchableOpacity
                        style={[s.pill, left === 0 && s.pillOff]}
                        disabled={left === 0}
                        accessibilityRole="button"
                        accessibilityLabel={`Prayed one ${MARK_LABEL[p].latin} back`}
                        onPress={() => prayedOneBack(p, now)}>
                        <Text style={[s.pillLabel, left === 0 && s.pillLabelOff]}>Prayed one</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={s.group}>
        <TouchableOpacity
          style={s.row}
          accessibilityRole="button"
          onPress={() => setEditingBacklog((v) => !v)}>
          <Text style={s.name}>
            {editingBacklog ? 'Done' : 'Adjust what you have to make up'}
          </Text>
          <Text style={s.rowParams}>{editingBacklog ? 'Close' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>
      {editingBacklog && (
        <Text style={s.note}>
          Set each prayer to the number you know you have to make up. Lower it for prayers you
          prayed without marking them here — Rakat only ever sees what you tap.
        </Text>
      )}

      {/*
        Every figure here counts UP. There is no missed count, no owed total and
        no streak that resets — the tracker reads as consistency, never as debt.
        See DESIGN.md and the test in src/lock/prayed.test.ts that asserts no
        field is named missed/debt/owed/streak.
      */}
      <Text style={s.section}>Over time</Text>
      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statValue}>{daysConsistent}</Text>
          <Text style={s.statLabel}>days consistent</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statValue}>{state.totalPrayed}</Text>
          <Text style={s.statLabel}>prayers marked</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statValue}>{state.onTime}</Text>
          <Text style={s.statLabel}>on time</Text>
        </View>
      </View>
      <Text style={s.note}>
        &ldquo;Days consistent&rdquo; counts the days in the last month where all five were marked.
        It is a rolling count, not a streak, so nothing is ever broken. Paused days are left out of
        it entirely.
      </Text>
    </Screen>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.ground },
    h1: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.ink,
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.md,
    },
    section: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.color.inkMuted,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.xl,
      paddingBottom: t.space.sm,
    },
    group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.hairline },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowDone: { backgroundColor: t.color.accent },
    rowParams: { fontFamily: t.font.latinUi, fontSize: t.latinSize.label, color: t.color.inkMuted },
    name: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    nameDone: { color: t.color.accentInk, fontFamily: t.font.latinSemibold },
    time: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      minWidth: 78,
      textAlign: 'right',
      ...tabularNums,
    },

    // The week strip. `row` is direction-aware in Yoga, so the seven days
    // mirror wholesale under RTL without a second layout.
    week: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.xs,
    },
    day: { alignItems: 'center', gap: t.space.sm },
    dayLabel: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
    },
    dayMark: {
      width: 36,
      height: 36,
      borderRadius: t.radius.mark,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.color.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.hairline,
    },
    /** Not a failure state and not a gap: a flat neutral field, no warm hue. */
    dayPaused: { backgroundColor: t.color.hairline, borderColor: t.color.hairline },
    dayFull: { backgroundColor: t.color.accent, borderColor: t.color.accent },
    dayCount: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      ...tabularNums,
    },
    dayCountPaused: { color: t.color.inkMuted },
    dayCountFull: { color: t.color.accentInk, fontFamily: t.font.latinSemibold },

    stats: { flexDirection: 'row', paddingHorizontal: t.space.lg, gap: t.space.xl },
    stat: { gap: t.space.xs },
    statValue: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.display,
      lineHeight: t.latinSize.display,
      letterSpacing: -1,
      color: t.color.accent,
      ...tabularNums,
    },
    statLabel: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
    },

    bar: {
      flexDirection: 'row',
      height: 4,
      marginHorizontal: t.space.lg,
      marginTop: t.space.lg,
      backgroundColor: t.color.hairline,
    },
    barFill: { backgroundColor: t.color.accent },

    paces: {
      flexDirection: 'row',
      gap: t.space.sm,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.md,
    },
    pace: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      borderRadius: t.radius.button,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.hairline,
      backgroundColor: t.color.surface,
    },
    paceSelected: { backgroundColor: t.color.accent, borderColor: t.color.accent },
    paceLabel: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
    },
    paceLabelSelected: { fontFamily: t.font.latinUiSemibold, color: t.color.accentInk },

    left: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      minWidth: 32,
      textAlign: 'right',
      ...tabularNums,
    },
    pill: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.button,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.accent,
    },
    pillOff: { borderColor: t.color.hairline },
    pillLabel: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      color: t.color.accent,
    },
    pillLabelOff: { fontFamily: t.font.latinUi, color: t.color.inkMuted },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
    stepBtn: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.title,
      color: t.color.accent,
      minWidth: 24,
      textAlign: 'center',
    },
    stepBtnOff: { color: t.color.hairline },
    stepValue: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      minWidth: 32,
      textAlign: 'center',
      ...tabularNums,
    },

    note: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      lineHeight: 17,
      color: t.color.inkMuted,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.md,
    },
  });
