import { StyleSheet, Text, View } from 'react-native';

import { arabicText, useTheme, type Theme } from '@/hooks/use-theme';
import { byRole } from '@/quran/attribution';
import { dailyAyah } from '@/quran/daily-ayah';

/**
 * The daily ayah card. Used on the home screen and on the Quran tab, so the
 * Arabic is rendered by one component in one way.
 *
 * Rendering rules, from DESIGN.md — all three matter, and breaking any of them
 * makes the text wrong rather than merely ugly:
 *   - Amiri Quran, `letterSpacing: 0`, line height 2.0 so tashkeel is not clipped
 *   - ONE <Text> for the verse; never split a line to style part of it
 *   - highlights (later, for word-by-word) go behind the text as positioned
 *     Views, never as a background on a nested Text
 */
export function AyahCard() {
  const t = useTheme();
  const s = styles(t);
  const ayah = dailyAyah();

  return (
    <View style={s.card}>
      <Text style={[arabicText(t, 'quran'), s.quran]} accessibilityLanguage="ar">
        {ayah.arabic}
      </Text>
      <Text style={s.translation}>{ayah.translation}</Text>
      <View style={s.footer}>
        <Text style={s.ref}>
          {ayah.surah} {ayah.reference}
        </Text>
        {/* Visible in-app so an unverified line can never quietly pass for a
            real translation. Disappears when REVIEW.md §3 is signed off. */}
        {!ayah.translationVerified && <Text style={s.unverified}>Translation unverified</Text>}
      </View>

      {/*
        Both credits, beside the text rather than in a settings page. The Arabic
        edition's credit was missing here and that is a licence gap, not a
        polish item: two of the three sources make attribution a condition of
        the grant. Sentence case at 11px — the uppercase treatment used for
        section labels turns a 60-character credit into three cramped lines.
      */}
      <Text style={s.credit}>{byRole('arabic').attribution}</Text>
      <Text style={s.credit}>{ayah.translator}</Text>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.color.surface,
      borderTopWidth: 2,
      borderTopColor: t.color.accent,
      marginHorizontal: t.space.lg,
      marginTop: t.space.md,
      padding: t.space.lg,
    },
    quran: { marginBottom: t.space.md },
    translation: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      lineHeight: 23,
      color: t.color.ink,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: t.space.sm,
      marginTop: t.space.md,
    },
    ref: {
      flex: 1,
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.color.inkMuted,
    },
    credit: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      lineHeight: 15,
      color: t.color.inkMuted,
      marginTop: 3,
    },
    unverified: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.now,
    },
  });
