import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectionTap } from '@/hooks/use-haptics';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { METHOD_LIST } from '@/prayer/methods';
import { useLocation } from '@/store/location';
import { useAthanSync } from '@/notify/use-athan-sync';
import { useOnboarded, useSettings } from '@/store/settings';

/**
 * Six screens, every one skippable, no account, no paywall, no location nag.
 *
 * The shape is a deliberate rejection of the category norm. Pillars and Salah
 * Focus both shipped a ~30-screen quiz terminating in a hard paywall, and the
 * research records it as the single biggest 1★ generator in the category
 * ("Wasted about 30 minutes answering questions and at the end I'm erasing this
 * app"). So: Skip is present on every screen and is permanent, Back exists, and
 * nothing here asks for money or an email.
 *
 * Screen 2 is the one that earns the install — picking your institution BY NAME
 * with its actual parameters printed beside it is the thing no competitor ships.
 */

const STEPS = ['welcome', 'method', 'madhab', 'location', 'athan', 'done'] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const t = useTheme();
  const s = styles(t);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const step: Step = STEPS[index];

  const { settings, update } = useSettings();
  const { location, requestDevice } = useLocation();
  const { finish } = useOnboarded();
  const athan = useAthanSync();
  const [athanOn, setAthanOn] = useState(false);

  const leave = async () => {
    // Set on skip as well as on finish: the app must never ask twice.
    await finish();
    router.replace('/');
  };

  const next = () => (index < STEPS.length - 1 ? setIndex(index + 1) : leave());

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.top}>
        {index > 0 ? (
          <TouchableOpacity onPress={() => setIndex(index - 1)} accessibilityRole="button">
            <Text style={s.topLink}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <TouchableOpacity onPress={leave} accessibilityRole="button">
          <Text style={s.topLink}>Skip</Text>
        </TouchableOpacity>
      </View>

      {step === 'welcome' && (
        <View style={s.body}>
          <MihrabGlyph color={t.color.accent} />
          <Text style={s.h1}>Prayer times your mosque would recognise.</Text>
          <Text style={s.p}>
            Pick the institution you follow and adjust any prayer by the minute. We never change your
            settings in an update.
          </Text>
          <Text style={s.p}>No account. No ads. Your location never leaves this phone.</Text>
        </View>
      )}

      {step === 'method' && (
        <View style={s.bodyTop}>
          <Text style={s.h2}>Which times do you follow?</Text>
          <ScrollView style={s.list} contentContainerStyle={s.listContent}>
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
                  <Text style={[s.rowName, selected && s.rowNameSel]}>{m.name}</Text>
                  <Text style={[s.rowParams, selected && s.rowParamsSel]}>{m.params}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {step === 'madhab' && (
        <View style={s.bodyTop}>
          <Text style={s.h2}>When does Asr begin?</Text>
          <Text style={s.p}>
            The two schools measure the shadow differently. If you are unsure, leave it as it is.
          </Text>
          <View style={s.list}>
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
                  <Text style={[s.rowName, selected && s.rowNameSel]}>{m.name}</Text>
                  <Text style={[s.rowParams, selected && s.rowParamsSel]}>{m.params}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {step === 'location' && (
        <View style={s.body}>
          <Text style={s.h2}>Where are you praying?</Text>
          <Text style={s.p}>
            Read once, stored on this phone, never sent anywhere. There is no analytics SDK in this
            app that could see it.
          </Text>
          {location ? (
            <Text style={s.confirmed}>{location.label}</Text>
          ) : (
            <Pressable style={s.secondaryBtn} onPress={requestDevice} accessibilityRole="button">
              <Text style={s.secondaryBtnText}>Use my location</Text>
            </Pressable>
          )}
          <Text style={s.fine}>
            You can set it later in Settings, or enter a city by hand. Skipping is fine.
          </Text>
        </View>
      )}

      {step === 'athan' && (
        <View style={s.body}>
          <Text style={s.h2}>Should we call the athan?</Text>
          <Text style={s.p}>
            A notification at each prayer time, with the full recording. You can turn individual
            prayers off later — most people silence Fajr first.
          </Text>
          {athanOn ? (
            <Text style={s.confirmed}>The athan will call</Text>
          ) : (
            <Pressable
              style={s.secondaryBtn}
              accessibilityRole="button"
              onPress={async () => setAthanOn(await athan.enable(true))}>
              <Text style={s.secondaryBtnText}>Turn on the athan</Text>
            </Pressable>
          )}
          <Text style={s.fine}>
            {athan.granted === false
              ? 'Notifications are off for Rakat. You can turn them on later in the iPhone Settings app.'
              : 'iOS allows 64 pending notifications, so Rakat tops the queue up every time you open it. Skipping is fine.'}
          </Text>
        </View>
      )}

      {step === 'done' && (
        <View style={s.body}>
          <MihrabGlyph color={t.color.accent} />
          <Text style={s.h1}>That&rsquo;s everything.</Text>
          <Text style={s.p}>
            {settings.method ? `${METHOD_LIST.find((m) => m.key === settings.method)?.name} times` : 'Your times'}
            {location ? ` for ${location.label}` : ''}, on your home screen. Change anything in
            Settings.
          </Text>
        </View>
      )}

      <View style={[s.foot, { paddingBottom: insets.bottom + t.space.lg }]}>
        <Pressable style={s.primaryBtn} onPress={next} accessibilityRole="button">
          <Text style={s.primaryBtnText}>
            {step === 'done'
              ? 'Open Rakat'
              : step === 'welcome'
                ? 'Choose my institution'
                : 'Continue'}
          </Text>
        </Pressable>
        <View style={s.dots} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((name, i) => (
            <View key={name} style={[s.dot, i === index && s.dotOn]} />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Two arches — a mihrab profile. The only illustration in the app.
 * No faces, no figures, no depiction of prophets: a hard constraint from the
 * research, not a style preference. See DESIGN.md.
 */
function MihrabGlyph({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            width: 26,
            height: 40,
            borderWidth: 1.5,
            borderBottomWidth: 0,
            borderColor: color,
            borderTopLeftRadius: 13,
            borderTopRightRadius: 13,
          }}
        />
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.ground },
    top: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.sm,
      minHeight: 32,
    },
    topLink: { fontFamily: t.font.latinUi, fontSize: t.latinSize.body, color: t.color.inkMuted },

    body: { flex: 1, justifyContent: 'center', paddingHorizontal: t.space.xl, gap: t.space.md },
    bodyTop: { flex: 1, paddingHorizontal: t.space.xl, paddingTop: t.space.lg, gap: t.space.md },
    h1: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      lineHeight: 27,
      letterSpacing: -0.4,
      color: t.color.ink,
    },
    h2: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      lineHeight: 27,
      color: t.color.ink,
    },
    p: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      lineHeight: 23,
      color: t.color.inkMuted,
    },
    fine: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      lineHeight: 17,
      color: t.color.inkMuted,
    },
    confirmed: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.accent,
    },

    list: { marginHorizontal: -t.space.xl, marginTop: t.space.sm },
    listContent: { paddingBottom: t.space.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowSelected: { backgroundColor: t.color.accent },
    rowName: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    rowNameSel: { fontFamily: t.font.latinSemibold, color: t.color.accentInk },
    rowParams: { fontFamily: t.font.latinUi, fontSize: t.latinSize.label, color: t.color.inkMuted },
    rowParamsSel: { color: t.color.accentInk, opacity: 0.85 },

    foot: { paddingHorizontal: t.space.xl, alignItems: 'center', gap: t.space.md },
    primaryBtn: {
      width: '100%',
      backgroundColor: t.color.accent,
      borderRadius: t.radius.button,
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.body,
      color: t.color.accentInk,
    },
    secondaryBtn: {
      alignSelf: 'flex-start',
      borderRadius: t.radius.button,
      borderWidth: 1,
      borderColor: t.color.hairline,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.xl,
    },
    secondaryBtnText: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.body,
      color: t.color.ink,
    },
    dots: { flexDirection: 'row', gap: 5 },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: t.color.hairline },
    dotOn: { backgroundColor: t.color.accent },
  });
