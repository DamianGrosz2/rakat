import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '@/components/screen';
import { AthanSettings } from '@/components/athan-settings';
import { LockSettings } from '@/components/lock-settings';
import { OffsetSettings } from '@/components/offset-settings';
import { selectionTap, stepTap } from '@/hooks/use-haptics';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { useLockSync } from '@/lock/use-lock-sync';
import { useAthanSync } from '@/notify/use-athan-sync';
import { METHOD_LIST } from '@/prayer/methods';
import { useLocation } from '@/store/location';
import { useAthanEnabled, useLockEnabled, useSettings } from '@/store/settings';

export default function Settings() {
  const t = useTheme();
  const s = styles(t);
  const { settings, ready, update } = useSettings();
  const { location, requestDevice } = useLocation();
  const { enabled: lockEnabled, toggle: toggleLock } = useLockEnabled();
  const lockStatus = useLockSync(lockEnabled);
  const { enabled: athanEnabled } = useAthanEnabled();
  const athan = useAthanSync();

  if (!ready) return <View style={s.screen} />;

  return (
    <Screen contentStyle={{ paddingTop: t.space.md }}>
      <Text style={s.h1}>Settings</Text>

      {/*
        The institution picker is the reason people install. Every row prints the
        actual parameters next to the name, because the people who care about
        this know their own angles — and printing them is the trust signal that
        no competitor offers.
      */}
      <Text style={s.section}>Calculation method</Text>
      <View style={s.group}>
        {METHOD_LIST.map((m) => {
          const selected = m.key === settings.method;
          return (
            <TouchableOpacity
              key={m.key}
              style={[s.row, selected && s.rowSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${m.name}, ${m.params}`}
              onPress={() => { selectionTap(); update({ method: m.key }); }}>
              <Text style={[s.rowName, selected && s.rowNameSelected]}>{m.name}</Text>
              <Text style={[s.rowParams, selected && s.rowParamsSelected]}>{m.params}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.note}>Your method is never changed by an app update.</Text>

      <OffsetSettings offsets={settings.offsets} onChange={(offsets) => update({ offsets })} />

      <Text style={s.section}>Asr</Text>
      <View style={s.group}>
        {(
          [
            { key: 'shafi', name: 'Shafi, Maliki, Hanbali', params: 'shadow ×1' },
            { key: 'hanafi', name: 'Hanafi', params: 'shadow ×2' },
          ] as const
        ).map((m) => {
          const selected = m.key === settings.madhab;
          return (
            <TouchableOpacity
              key={m.key}
              style={[s.row, selected && s.rowSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => { selectionTap(); update({ madhab: m.key }); }}>
              <Text style={[s.rowName, selected && s.rowNameSelected]}>{m.name}</Text>
              <Text style={[s.rowParams, selected && s.rowParamsSelected]}>{m.params}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.section}>Location</Text>
      <View style={s.group}>
        <TouchableOpacity style={s.row} accessibilityRole="button" onPress={requestDevice}>
          <Text style={s.rowName}>{location ? location.label : 'Not set'}</Text>
          <Text style={s.rowParams}>{location ? 'Change' : 'Use my location'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.note}>
        Read once and stored on this phone. It is never sent anywhere, and there is no analytics SDK
        in this app that could see it.
      </Text>

      <AthanSettings
        enabled={athanEnabled}
        granted={athan.granted}
        plan={athan.plan}
        onToggle={athan.enable}
      />

      <LockSettings enabled={lockEnabled} onToggle={toggleLock} status={lockStatus} />

      <Text style={s.section}>Hijri date</Text>
      <View style={s.group}>
        <View style={s.row}>
          <Text style={s.rowName}>Sighting offset</Text>
          <View style={s.stepper}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Decrease Hijri offset"
              onPress={() => {
                stepTap();
                update({ hijriOffsetDays: Math.max(-2, settings.hijriOffsetDays - 1) });
              }}>
              <Text style={s.stepBtn}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepValue}>
              {settings.hijriOffsetDays > 0 ? `+${settings.hijriOffsetDays}` : settings.hijriOffsetDays}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Increase Hijri offset"
              onPress={() => {
                stepTap();
                update({ hijriOffsetDays: Math.min(2, settings.hijriOffsetDays + 1) });
              }}>
              <Text style={s.stepBtn}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Text style={s.note}>
        Moon sighting differs by region. Shift the Hijri date by up to two days to match your
        community.
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
    rowSelected: { backgroundColor: t.color.accent },
    rowName: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    rowNameSelected: { fontFamily: t.font.latinSemibold, color: t.color.accentInk },
    rowParams: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
    },
    rowParamsSelected: { color: t.color.accentInk, opacity: 0.85 },
    note: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      lineHeight: 17,
      color: t.color.inkMuted,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.sm,
    },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
    stepBtn: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.title,
      color: t.color.accent,
      minWidth: 24,
      textAlign: 'center',
    },
    stepValue: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.ink,
      minWidth: 24,
      textAlign: 'center',
    },
  });
