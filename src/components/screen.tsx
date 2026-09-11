import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

/**
 * The root of every tab screen.
 *
 * Safe-area handling lives here and nowhere else, because getting it wrong is
 * invisible until it is on a device: iOS ScrollViews default to
 * `contentInsetAdjustmentBehavior="automatic"`, which silently adds the top
 * inset, so a screen that ALSO adds `insets.top` pushes its first row ~60pt down
 * — and a screen that removes both runs under the Dynamic Island. Both bugs were
 * shipped and caught here during simulator verification.
 *
 * The rule: `SafeAreaView` owns the inset, the ScrollView is told to keep its
 * hands off. One place, one behaviour, four screens.
 */
export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  /** False for screens that lay out to the viewport rather than scrolling. */
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const base = { flex: 1, backgroundColor: t.color.ground };

  /**
   * The native tab bar floats over the content and is translucent, so the last
   * thing on every screen scrolls underneath it. 52pt is the bar itself; the
   * inset covers the home indicator. Without this the ayah card's attribution —
   * which is a licence condition, not decoration — sits behind the tab bar.
   */
  const bottom = insets.bottom + 52 + t.space.lg;

  if (!scroll) {
    return (
      <SafeAreaView edges={['top']} style={base}>
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={base}>
      <ScrollView
        // flex, NOT StyleSheet.absoluteFill: an absolutely positioned child is
        // laid out against the parent's border box and so escapes the
        // SafeAreaView's padding entirely, putting the first row back under the
        // Dynamic Island. That exact bug was caught in the simulator here.
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[{ paddingBottom: bottom }, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
