/**
 * The shield screen: what a blocked app shows at prayer time.
 *
 * Pure — no `react-native-device-activity` import — so the copy and the colours
 * are unit-tested. `engine.ts` hands the result to `updateShield`.
 *
 * ## What a shield may contain
 *
 * A `ManagedSettingsUI` shield is **static**: a title, a subtitle, an icon and
 * two buttons. It cannot show a countdown, cannot read live data, and cannot
 * deep-link. Everything on it has to be decided before it appears. That is not
 * a limitation to work around — it is the reason the confirmation screen exists
 * inside the app.
 *
 * ## Colour
 *
 * Deliberately single-appearance: the shield paints its own full-bleed field, so
 * it does not follow the blocked app's or the system's appearance. It uses the
 * LIGHT palette's accent (deep green carrying bone), which reads on any
 * wallpaper. Values still come from `tokens.ts`, so the parity test covers them.
 */

import { light } from '@/theme/tokens';

/** `react-native-device-activity` wants 0–255 channels, not a hex string. */
export type UIColorRGB = { red: number; green: number; blue: number; alpha?: number };

export function hexToUIColor(hex: string, alpha = 1): UIColorRGB {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16),
    green: parseInt(h.slice(2, 4), 16),
    blue: parseInt(h.slice(4, 6), 16),
    alpha,
  };
}

export type ShieldCopy = {
  title: string;
  subtitle: string;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
};

/**
 * The words. Kept separate from the styling so they can be translated and
 * reviewed on their own — every string here is user-facing and lands in
 * REVIEW.md when the German and Turkish versions exist.
 *
 * Tone rule, from the product spec: the tracker and everything around it read as
 * consistency, never as debt. So: no "you missed", no guilt, no countdown of
 * what is owed. It states what is happening and offers the way out.
 */
export function shieldCopy(prayerLatin: string): ShieldCopy {
  return {
    title: `${prayerLatin} has begun`,
    subtitle: 'This app is paused until you mark the prayer.',
    primaryButtonLabel: 'I prayed',
    secondaryButtonLabel: 'Not now',
  };
}

export type ShieldConfigurationInput = {
  backgroundColor: UIColorRGB;
  title: string;
  titleColor: UIColorRGB;
  subtitle: string;
  subtitleColor: UIColorRGB;
  iconSystemName: string;
  iconTint: UIColorRGB;
  primaryButtonLabel: string;
  primaryButtonLabelColor: UIColorRGB;
  primaryButtonBackgroundColor: UIColorRGB;
  secondaryButtonLabel: string;
  secondaryButtonLabelColor: UIColorRGB;
};

export function buildShieldConfiguration(prayerLatin: string): ShieldConfigurationInput {
  const copy = shieldCopy(prayerLatin);
  return {
    backgroundColor: hexToUIColor(light.accent),
    title: copy.title,
    titleColor: hexToUIColor(light.accentInk),
    subtitle: copy.subtitle,
    subtitleColor: hexToUIColor(light.accentInk, 0.8),
    // A clock, not a religious symbol. The shield is about *time* — claiming a
    // symbol here would be a theological statement the app has no business
    // making, and the mihrab glyph needs a real asset (see HANDOFF.md).
    iconSystemName: 'clock',
    iconTint: hexToUIColor(light.accentInk),
    primaryButtonLabel: copy.primaryButtonLabel,
    primaryButtonLabelColor: hexToUIColor(light.accent),
    primaryButtonBackgroundColor: hexToUIColor(light.accentInk),
    secondaryButtonLabel: copy.secondaryButtonLabel,
    secondaryButtonLabelColor: hexToUIColor(light.accentInk, 0.7),
  };
}

/**
 * What the two buttons do.
 *
 * "I prayed" unblocks and opens the app, which then records the mark and shows
 * the confirmation. It has to open the app: this library does not record shield
 * taps as events, so nothing else would ever learn the prayer was marked.
 *
 * "Not now" closes the shield and **leaves the app blocked**. That is the point
 * of a lock — a secondary button that also unblocks would make the whole
 * feature decorative.
 */
export function buildShieldActions(familyActivitySelectionId: string) {
  return {
    primary: {
      behavior: 'close' as const,
      actions: [
        { type: 'unblockSelection' as const, familyActivitySelectionId },
        { type: 'openApp' as const },
      ],
    },
    secondary: {
      behavior: 'close' as const,
      actions: [],
    },
  };
}
