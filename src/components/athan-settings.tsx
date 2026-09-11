import { useAudioPlayer } from 'expo-audio';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { useTheme, type Theme } from '@/hooks/use-theme';
import type { AthanPlan } from '@/notify/plan';

/**
 * Athan settings.
 *
 * The preview matters more than it looks: the athan is a 29-second recording
 * that will play at full volume at 4am, and nobody should first hear it then.
 */
export function AthanSettings({
  enabled,
  granted,
  plan,
  onToggle,
}: {
  enabled: boolean;
  granted: boolean | null;
  plan: AthanPlan | null;
  onToggle: (next: boolean) => void;
}) {
  const t = useTheme();
  const s = styles(t);
  const player = useAudioPlayer(require('@/assets/audio/adhan-full.m4a'));

  const preview = () => {
    if (player.playing) {
      player.pause();
      player.seekTo(0);
    } else {
      player.seekTo(0);
      player.play();
    }
  };

  return (
    <>
      <Text style={s.section}>Athan</Text>
      <View style={s.group}>
        <View style={s.row}>
          <Text style={s.rowName}>Call the athan</Text>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ true: t.color.accent, false: t.color.hairline }}
            accessibilityLabel="Call the athan at each prayer time"
          />
        </View>
        <TouchableOpacity style={s.row} onPress={preview} accessibilityRole="button">
          <Text style={s.rowName}>{player.playing ? 'Stop' : 'Hear it'}</Text>
          <Text style={s.rowHint}>{player.playing ? 'Playing' : 'Preview'}</Text>
        </TouchableOpacity>
      </View>

      {granted === false && (
        <Text style={[s.note, s.warn]}>
          Notifications are turned off for Rakat. Turn them on in the iPhone Settings app and the
          athan will start calling.
        </Text>
      )}

      <Text style={s.note}>
        iOS holds 64 pending notifications, so Rakat tops the queue up every time you open it —
        about {plan ? Math.floor(plan.notifications.length / 5) : 12} days ahead
        {plan?.coversUntil
          ? `, through ${plan.coversUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
          : ''}
        .
      </Text>

      <Text style={s.note}>
        Recording: “Beautiful adhan” by Adam-synagda, public domain (CC0), via Wikimedia Commons.
      </Text>
    </>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
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
      paddingVertical: t.space.sm,
      minHeight: 48,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    rowName: { flex: 1, fontFamily: t.font.latin, fontSize: t.latinSize.body, color: t.color.ink },
    rowHint: { fontFamily: t.font.latinUi, fontSize: t.latinSize.label, color: t.color.inkMuted },
    note: {
      fontFamily: t.font.latin,
      fontSize: t.latinSize.label,
      lineHeight: 17,
      color: t.color.inkMuted,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.sm,
    },
    warn: { color: t.color.now },
  });
