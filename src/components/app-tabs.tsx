import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';

/**
 * Native tab bar, not a custom one. DESIGN.md: use platform conventions unless
 * we know we have a better idea, and for a bottom tab bar we do not.
 *
 * Five destinations is the whole app. Qibla earns a tab because it is used at a
 * specific moment — standing in an unfamiliar room, about to pray — and burying
 * it a level down inside Prayer costs a tap at exactly the wrong time.
 */
export default function AppTabs() {
  const t = useTheme();

  return (
    <NativeTabs
      backgroundColor={t.color.ground}
      indicatorColor={t.color.surface}
      labelStyle={{ selected: { color: t.color.accent }, color: t.color.inkMuted }}>
      {/* TODO(android): NativeTabs takes `drawable="ic_name"` on Android; add the
          five drawables with the Android port. iOS uses the SF Symbols below. */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Prayer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="qibla">
        <NativeTabs.Trigger.Label>Qibla</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="location.north.line" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reader">
        <NativeTabs.Trigger.Label>Quran</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book.closed" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tracker">
        <NativeTabs.Trigger.Label>Tracker</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checkmark.circle" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
