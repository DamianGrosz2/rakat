import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { useTheme, type Theme } from '@/hooks/use-theme';
import { SELECTION_ID, publishShield, requestAuthorization, type LockStatus } from '@/lock/engine';
import { isLockAvailable } from '@/lock/flags';

/**
 * Settings for the prayer-time app lock.
 *
 * Deliberately not called "Salah Lock" anywhere a user can see — an app by that
 * name already exists.
 *
 * The whole section is behind `isLockAvailable()`, so turning
 * `LOCK_FEATURE_ENABLED` off removes it without touching this file. The lock is
 * the leading acquisition-hook *candidate*, not the proven product: the prayer
 * core ships either way.
 */
export function LockSettings({
  enabled,
  onToggle,
  status,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  status: LockStatus | null;
}) {
  const t = useTheme();
  const s = styles(t);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // Publish the shield's look up front so it is never the default grey box
    // the first time a monitor fires.
    if (enabled) publishShield('Prayer');
  }, [enabled]);

  const enable = useCallback(
    async (next: boolean) => {
      if (next) {
        const ok = await requestAuthorization();
        setAuthorized(ok);
        if (!ok) return; // leave the switch off; the note below explains why
      }
      onToggle(next);
    },
    [onToggle],
  );

  if (!isLockAvailable()) return null;

  return (
    <>
      <Text style={s.section}>Pause apps at prayer time</Text>
      <View style={s.group}>
        <View style={s.row}>
          <Text style={s.rowName}>Pause chosen apps</Text>
          <Switch
            value={enabled}
            onValueChange={enable}
            trackColor={{ true: t.color.accent, false: t.color.hairline }}
            accessibilityLabel="Pause chosen apps at prayer time"
          />
        </View>

        {enabled && (
          <DeviceActivitySelectionSheetViewPersisted
            familyActivitySelectionId={SELECTION_ID}
            style={s.picker}>
            <TouchableOpacity style={s.rowInner} accessibilityRole="button">
              <Text style={s.rowName}>Choose apps</Text>
              <Text style={s.rowHint}>Pick</Text>
            </TouchableOpacity>
          </DeviceActivitySelectionSheetViewPersisted>
        )}
      </View>

      <Text style={s.note}>
        At each prayer the chosen apps pause until you mark the prayer. &ldquo;Not now&rdquo; closes
        the screen and leaves them paused. Nothing is ever locked for longer than the prayer window.
      </Text>

      {authorized === false && (
        <Text style={[s.note, s.warn]}>
          Screen Time access was not granted. It is unavailable in the simulator and needs Apple&rsquo;s
          Family Controls approval on a real device.
        </Text>
      )}

      {status?.state === 'ready' && (
        <Text style={s.note}>
          {status.monitors} prayer {status.monitors === 1 ? 'window' : 'windows'} scheduled
          {status.dropped > 0 ? `, ${status.dropped} beyond the system limit` : ''}.
        </Text>
      )}
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.hairline,
    },
    picker: { backgroundColor: t.color.surface },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
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
