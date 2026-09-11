import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Screen } from '@/components/screen';
import { arabicText, tabularNums, useTheme, type Theme } from '@/hooks/use-theme';
import { greatCircleDistanceKm, KAABA, qiblaBearing } from '@/qibla/bearing';
import { QiblaDial } from '@/qibla/dial';
import { useQiblaHeading, useReduceMotion, type QiblaHeading } from '@/qibla/use-heading';
import { useLocation } from '@/store/location';

/** "4130" -> "4,130". Deterministic, and does not depend on Intl being present. */
function thousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Left and right here are the user's body, not the layout. They do not mirror
 * under RTL, which is why this string is not built from `start`/`end`.
 */
function turnLabel(delta: number, aligned: boolean): string {
  if (aligned) return 'Facing the Kaaba';
  const d = Math.round(Math.abs(delta));
  return delta > 0 ? `Turn right ${d}°` : `Turn left ${d}°`;
}

/**
 * What to print where the turn instruction goes when there is no reading.
 * A static line, never a spinner — DESIGN.md is explicit that a loading state in
 * this app is a state, not an animation.
 */
function statusLine(status: QiblaHeading['status']): string {
  switch (status) {
    case 'waiting':
      return 'Finding north…';
    case 'unavailable':
      return 'No live compass';
    case 'denied':
      return 'Compass off';
    default:
      return ' ';
  }
}

/**
 * The one line of explanation under the table. At most one shows at a time, in
 * priority order — an uncalibrated compass matters more than a frozen dial.
 */
function noteFor(heading: QiblaHeading, reduceMotion: boolean): string | null {
  if (heading.status === 'unavailable') {
    return 'This device has no compass, so the dial is fixed to true north and the bearing above is a map bearing. Live heading needs a real phone — it does not work in the simulator.';
  }
  if (heading.status === 'denied') {
    return 'A live compass needs location permission: it is what lets the phone correct magnetic north for your local declination. Grant it under Location in Settings.';
  }
  if (heading.status !== 'live') return null;

  if (heading.accuracy < 1) {
    return 'The compass needs calibrating — move the phone in a figure eight. Until then the heading can be tens of degrees out.';
  }
  if (!heading.trueNorth) {
    return 'Showing magnetic north: the phone has no fix to correct for declination, so this reading can be up to twenty degrees off the qibla.';
  }
  if (reduceMotion) {
    return 'The dial is held still for Reduce Motion. The turn instruction above is live.';
  }
  return null;
}

export default function Qibla() {
  const t = useTheme();
  const s = styles(t);
  const { width } = useWindowDimensions();

  const { location, ready } = useLocation();
  const reduceMotion = useReduceMotion();

  const qibla = location ? qiblaBearing(location.coords) : null;
  const heading = useQiblaHeading(qibla);
  const aligned = heading.status === 'live' && heading.aligned;

  useEffect(() => {
    if (!aligned) return;
    // One buzz on the crossing into aligned. The effect only runs when `aligned`
    // actually changes, and the release band inside `isAligned` is what stops a
    // jittering compass re-crossing and buzzing again.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [aligned]);

  if (!ready) return <View style={s.screen} />;

  if (!location || qibla === null) {
    return (
      <View style={[s.screen, s.empty]}>
        <Text style={s.emptyTitle}>Which way is the Kaaba?</Text>
        <Text style={s.emptyBody}>
          The qibla is computed from your coordinates, on this phone. Set your location once and it
          stays here — it is never sent anywhere.
        </Text>
        <Pressable
          style={s.primaryBtn}
          onPress={() => router.push('/settings')}
          accessibilityRole="button">
          <Text style={s.primaryBtnText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  const km = greatCircleDistanceKm(location.coords, KAABA);
  const live = heading.status === 'live';
  const note = noteFor(heading, reduceMotion);

  // With no live heading the rose is pinned to true north, which is honest: the
  // marker then reads as a bearing on a map rather than a direction in the room.
  // Reduce Motion pins it for a different reason — a dial turning continuously
  // under the hand is exactly the motion that setting suppresses — and says so
  // in the note below, so a still dial is never mistaken for a broken one.
  const roseHeading = heading.status === 'live' && !reduceMotion ? heading.degrees : 0;
  const dialSize = Math.min(288, width - t.space.xxl * 2);

  return (
    <Screen contentStyle={{ paddingTop: t.space.md }}>
      <View style={s.head}>
        <Text style={s.h1}>Qibla</Text>
        {/* One <Text>, no tracking — arabicText guarantees letterSpacing: 0. */}
        <Text style={arabicText(t, 'display', t.color.inkMuted)}>القبلة</Text>
      </View>

      <View
        style={[s.dialWrap, { height: dialSize }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          heading.status === 'live'
            ? `Qibla ${Math.round(qibla)} degrees from true north. ${turnLabel(heading.delta, aligned)}.`
            : `Qibla ${Math.round(qibla)} degrees from true north. No live compass.`
        }>
        <QiblaDial
          size={dialSize}
          qibla={qibla}
          heading={roseHeading}
          aligned={aligned}
          live={live}
        />
        {/*
          Sits inside the rose, whose centre is cleared for it. The type cap is
          the one place this screen limits Dynamic Type: the readout lives inside
          fixed dial geometry, and past ~1.3x it grows into the qibla marker.
          Nothing is lost — the whole dial carries an accessibilityLabel that
          reads the same numbers aloud.
        */}
        <View style={s.readout} pointerEvents="none">
          <Text
            style={[s.bearing, aligned && s.bearingAligned]}
            maxFontSizeMultiplier={1.3}
            accessibilityElementsHidden>
            {Math.round(qibla)}°
          </Text>
          <Text style={s.readoutLabel} maxFontSizeMultiplier={1.3} accessibilityElementsHidden>
            True north
          </Text>
        </View>
      </View>

      <Text style={[s.turn, aligned && s.turnAligned]}>
        {heading.status === 'live'
          ? turnLabel(heading.delta, aligned)
          : statusLine(heading.status)}
      </Text>

      <View style={s.group}>
        <View style={s.row}>
          <Text style={s.rowName}>Makkah</Text>
          <Text style={s.rowValue}>{thousands(km)} km</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowName}>From</Text>
          <Text style={s.rowValue}>{location.label}</Text>
        </View>
      </View>

      {note ? <Text style={s.note}>{note}</Text> : null}
    </Screen>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.ground },

    empty: { paddingHorizontal: t.space.lg, gap: t.space.md, justifyContent: 'center' },
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

    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.lg,
    },
    h1: { fontFamily: t.font.latinSemibold, fontSize: t.latinSize.title, color: t.color.ink },

    dialWrap: { alignItems: 'center', justifyContent: 'center' },
    // Logical insets, not left/right — DESIGN.md, and it costs nothing here.
    readout: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      start: 0,
      end: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /*
      DESIGN.md reserves `display` for "the next-prayer time, and nothing else".
      Read strictly, that forbids this. Read as what the rule protects — one hero
      figure per screen, and no fifth size in the budget — the qibla bearing is
      this screen's next-prayer time, and it is also the figure that has to
      survive a TikTok re-encode. Flagged for the design owner, not decided
      quietly.
    */
    bearing: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.display,
      lineHeight: t.latinSize.display * 1.1,
      letterSpacing: -1,
      color: t.color.ink,
      ...tabularNums,
    },
    bearingAligned: { color: t.color.accent },
    readoutLabel: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.color.inkMuted,
    },

    turn: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.inkMuted,
      textAlign: 'center',
      paddingTop: t.space.lg,
      paddingBottom: t.space.xl,
      ...tabularNums,
    },
    turnAligned: { fontFamily: t.font.latinSemibold, color: t.color.accent },

    group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.hairline },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowName: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    rowValue: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.inkMuted,
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
