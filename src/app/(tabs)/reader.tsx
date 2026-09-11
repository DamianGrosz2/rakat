import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AyahCard } from '@/components/ayah-card';
import { Screen } from '@/components/screen';
import { selectionTap } from '@/hooks/use-haptics';
import { arabicText, tabularNums, useTheme, type Theme } from '@/hooks/use-theme';
import { ATTRIBUTION, listSurahs, surahVerses, type Surah, type Verse } from '@/quran/db';

type Lang = 'de' | 'en' | 'none';

/**
 * The reader. Text mode only — page mode is explicitly out of scope for v1.
 *
 * Arabic rendering here is the highest-stakes drawing in the app. Three rules,
 * from DESIGN.md, and all three are about correctness rather than looks:
 *   - Amiri Quran, `letterSpacing: 0`, one <Text> per verse. Splitting a line or
 *     adding tracking breaks the joins between letters.
 *   - The verse number is its OWN Text, never appended to the Arabic run, so it
 *     cannot disturb the shaping of the last word.
 *   - Attribution travels with the text, not buried in a settings page: two of
 *     the three licences make the credit a condition of the grant.
 */
export default function Reader() {
  const t = useTheme();
  const s = styles(t);

  const [surahs, setSurahs] = useState<Surah[] | null>(null);
  const [open, setOpen] = useState<Surah | null>(null);
  // Keyed by surah so "still loading" is DERIVED rather than set to null inside
  // an effect, which would be a synchronous setState during render.
  const [loaded, setLoaded] = useState<{ surah: number; verses: Verse[] } | null>(null);
  const [lang, setLang] = useState<Lang>('de');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSurahs()
      .then(setSurahs)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const want = open.number;
    surahVerses(want)
      .then((v) => alive && setLoaded({ surah: want, verses: v }))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open]);

  const verses = loaded && open && loaded.surah === open.number ? loaded.verses : null;

  const openSurah = useCallback((su: Surah) => {
    selectionTap();
    setOpen(su);
  }, []);

  if (error) {
    return (
      <Screen scroll={false} contentStyle={s.centred}>
        <Text style={s.h1}>The mushaf could not be opened</Text>
        <Text style={s.body}>{error}</Text>
      </Screen>
    );
  }

  if (open) {
    return (
      <SurahView
        surah={open}
        verses={verses}
        lang={lang}
        onLang={setLang}
        onBack={() => {
          selectionTap();
          setOpen(null);
        }}
      />
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingTop: t.space.md }}>
      <Text style={s.h1}>Quran</Text>
      <AyahCard />
      <Text style={s.section}>All 114 surahs</Text>
      <View style={s.group}>
        {surahs === null ? (
          <View style={s.loading}>
            <ActivityIndicator color={t.color.accent} />
          </View>
        ) : (
          surahs.map((su) => (
            <Pressable
              key={su.number}
              onPress={() => openSurah(su)}
              accessibilityRole="button"
              accessibilityLabel={`${su.latin}, ${su.ayahs} verses`}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <Text style={s.num}>{su.number}</Text>
              <View style={s.rowMain}>
                <Text style={s.latin}>{su.latin}</Text>
                <Text style={s.meta}>
                  {su.english} · {su.ayahs} · {su.revelation}
                </Text>
              </View>
              <Text style={arabicText(t, 'display', t.color.ink)}>{su.arabic}</Text>
            </Pressable>
          ))
        )}
      </View>
      <Credit />
    </Screen>
  );
}

function SurahView({
  surah,
  verses,
  lang,
  onLang,
  onBack,
}: {
  surah: Surah;
  verses: Verse[] | null;
  lang: Lang;
  onLang: (l: Lang) => void;
  onBack: () => void;
}) {
  const t = useTheme();
  const s = styles(t);
  const insets = useSafeAreaInsets();
  // The FlatList sets its own content padding, so it needs the same tab-bar
  // clearance `Screen` applies — otherwise the last verse and the credit sit
  // behind the floating tab bar.
  const bottom = insets.bottom + 52 + t.space.lg;

  const header = useMemo(
    () => (
      <View>
        <View style={s.surahHead}>
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={10}>
            <Text style={s.back}>← All surahs</Text>
          </Pressable>
          <View style={s.langs}>
            {(['de', 'en', 'none'] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => {
                  selectionTap();
                  onLang(l);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: lang === l }}>
                <Text style={[s.lang, lang === l && s.langOn]}>
                  {l === 'none' ? 'Arabic only' : l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.surahTitle}>
          <Text style={arabicText(t, 'quran', t.color.ink)}>{surah.arabic}</Text>
          <Text style={s.surahLatin}>
            {surah.latin} · {surah.english}
          </Text>
          <Text style={s.meta}>
            {surah.ayahs} verses · revealed in {surah.revelation}
          </Text>
        </View>
      </View>
    ),
    [surah, lang, onBack, onLang, s, t],
  );

  if (verses === null) {
    return (
      <Screen scroll={false} contentStyle={s.centred}>
        <ActivityIndicator color={t.color.accent} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={verses}
        keyExtractor={(v) => `${v.surah}:${v.ayah}`}
        ListHeaderComponent={header}
        ListFooterComponent={<Credit />}
        contentContainerStyle={{ paddingBottom: bottom }}
        initialNumToRender={12}
        renderItem={({ item }) => (
          <View style={s.verse}>
            {/* One Text for the whole verse. The number lives outside it so it
                can never disturb the shaping of the final word. */}
            <Text style={[arabicText(t, 'quran', t.color.ink), s.arabic]}>{item.arabic}</Text>
            <View style={s.verseFoot}>
              <Text style={s.ayahNum}>
                {item.surah}:{item.ayah}
              </Text>
              {lang !== 'none' && (
                <Text style={s.translation}>{lang === 'de' ? item.de : item.en}</Text>
              )}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

/**
 * Credit beside the text, not in a settings page. QuranEnc's terms make the
 * attribution and the retained version a condition of republication.
 */
function Credit() {
  const t = useTheme();
  const s = styles(t);
  return (
    <View style={s.credit}>
      {ATTRIBUTION.map((line) => (
        <Text key={line} style={s.creditLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    centred: { alignItems: 'center', justifyContent: 'center', padding: t.space.xl, gap: t.space.md },
    h1: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.ink,
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.md,
    },
    body: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.inkMuted,
      textAlign: 'center',
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
    loading: { padding: t.space.xl, alignItems: 'center' },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      minHeight: 56,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowPressed: { backgroundColor: t.color.hairline },
    rowMain: { flex: 1 },
    num: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
      minWidth: 24,
      ...tabularNums,
    },
    latin: { fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    meta: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      color: t.color.inkMuted,
      marginTop: 2,
    },

    surahHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.md,
      paddingBottom: t.space.sm,
    },
    back: { fontFamily: t.font.latinUi, fontSize: t.latinSize.body, color: t.color.accent },
    langs: { flexDirection: 'row', gap: t.space.md },
    lang: { fontFamily: t.font.latinUi, fontSize: t.latinSize.label, color: t.color.inkMuted },
    langOn: { fontFamily: t.font.latinUiSemibold, color: t.color.accent },
    surahTitle: {
      alignItems: 'center',
      gap: t.space.xs,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    surahLatin: {
      fontFamily: t.font.latinSemibold,
      fontSize: t.latinSize.title,
      color: t.color.ink,
    },

    verse: {
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    arabic: { textAlign: 'right' },
    verseFoot: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md, marginTop: t.space.md },
    ayahNum: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      color: t.color.accent,
      minWidth: 46,
      ...tabularNums,
    },
    translation: {
      flex: 1,
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      lineHeight: 23,
      color: t.color.inkMuted,
    },

    credit: { padding: t.space.lg, gap: 2 },
    creditLine: {
      fontFamily: t.font.latinUi,
      fontSize: t.latinSize.label,
      lineHeight: 16,
      color: t.color.inkMuted,
    },
  });
