import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { selectionTap, stepTap } from '@/hooks/use-haptics';
import { arabicText, tabularNums, useTheme, type Theme } from '@/hooks/use-theme';
import { MARK_LABEL } from '@/prayer/labels';
import { MARK_NAMES, NO_OFFSETS, type MarkName, type Offsets } from '@/prayer/methods';

/** Widest sensible nudge. Beyond this the user has picked the wrong institution. */
const LIMIT = 30;

/**
 * "Match my mosque" — per-prayer offsets in signed minutes.
 *
 * This is the escape hatch that makes the institution presets honest. Every
 * preset is an approximation of what a given mosque actually prints (DITIB most
 * of all — see HANDOFF.md), and the user is the one holding the printed
 * timetable. Rather than pretend the presets are exact, we let them close the
 * last few minutes themselves.
 *
 * The offsets compose additively on top of whatever the method already declares,
 * and they are preserved verbatim across app updates — `migrateSettings` has a
 * test asserting exactly that.
 */
export function OffsetSettings({
  offsets,
  onChange,
}: {
  offsets: Offsets;
  onChange: (next: Offsets) => void;
}) {
  const t = useTheme();
  const s = styles(t);
  const dirty = MARK_NAMES.some((m) => offsets[m] !== 0);

  const nudge = (mark: MarkName, delta: number) => {
    stepTap();
    onChange({
      ...offsets,
      [mark]: Math.max(-LIMIT, Math.min(LIMIT, offsets[mark] + delta)),
    });
  };

  return (
    <>
      <View style={s.head}>
        <Text style={s.section}>Match my mosque</Text>
        {dirty && (
          <TouchableOpacity onPress={() => { selectionTap(); onChange({ ...NO_OFFSETS }); }} accessibilityRole="button">
            <Text style={s.reset}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.group}>
        {MARK_NAMES.map((mark) => {
          const value = offsets[mark];
          return (
            <View key={mark} style={s.row}>
              <Text style={s.name}>{MARK_LABEL[mark].latin}</Text>
              <Text style={arabicText(t, 'ui', t.color.inkMuted)}>{MARK_LABEL[mark].arabic}</Text>
              <View style={s.stepper}>
                <TouchableOpacity
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${MARK_LABEL[mark].latin} one minute earlier`}
                  onPress={() => nudge(mark, -1)}>
                  <Text style={s.step}>−</Text>
                </TouchableOpacity>
                <Text style={[s.value, value !== 0 && s.valueSet]}>
                  {value > 0 ? `+${value}` : value}
                </Text>
                <TouchableOpacity
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${MARK_LABEL[mark].latin} one minute later`}
                  onPress={() => nudge(mark, 1)}>
                  <Text style={s.step}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={s.note}>
        Minutes added to or taken off each time, on top of your institution. Use it to match the
        timetable your mosque prints. These survive app updates.
      </Text>
    </>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.xl,
      paddingBottom: t.space.sm,
    },
    section: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.label,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.color.inkMuted,
    },
    reset: { fontFamily: t.font.latinUi, fontSize: t.latinSize.label, color: t.color.accent },
    group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.hairline },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.sm,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    name: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
    step: {
      fontFamily: t.font.latinUiSemibold,
      fontSize: t.latinSize.title,
      color: t.color.accent,
      minWidth: 22,
      textAlign: 'center',
    },
    value: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.body,
      color: t.color.inkMuted,
      minWidth: 34,
      textAlign: 'center',
      ...tabularNums,
    },
    valueSet: { color: t.color.ink, fontFamily: t.font.latinSemibold },
    note: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      lineHeight: 17,
      color: t.color.inkMuted,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.sm,
    },
  });
