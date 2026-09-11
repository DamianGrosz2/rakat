import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics, used sparingly.
 *
 * DESIGN.md allows exactly one visual animation in this app, and the same
 * restraint applies here: a tap that *changes what the app will do* gets a
 * response, and nothing else does. Scrolling, navigating and reading are silent.
 *
 * Every call is fire-and-forget and swallows its error — the taptic engine is
 * absent on the simulator and on some Android hardware, and a missing buzz must
 * never break an interaction.
 */

function safe(run: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  run().catch(() => undefined);
}

/** Picking one of a set: an institution, a madhab, a pace. */
export function selectionTap() {
  safe(() => Haptics.selectionAsync());
}

/** A prayer marked. The one moment in the app worth a real thump. */
export function markedTap() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A nudge that moves a value by one step. */
export function stepTap() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Qibla alignment reached. */
export function alignedTap() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
