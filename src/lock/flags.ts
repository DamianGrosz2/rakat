/**
 * The Salah Lock feature flag.
 *
 * The lock is the leading *acquisition-hook candidate*, not the proven product.
 * The prayer core is what ships either way; the marketing test decides whether
 * the lock leads. So it sits behind a flag and can be turned off without
 * touching a screen.
 *
 * Two gates, both must pass:
 *   1. `LOCK_FEATURE_ENABLED` — the build-time flag. Flip to false and the
 *      Settings section disappears entirely.
 *   2. Platform — iOS only for now. The Android blocker is a separate
 *      implementation (noreeels' `wrapper/blocking/`, see HANDOFF.md).
 *
 * A third gate is the user's own toggle, stored in settings.
 */

import { Platform } from 'react-native';

/**
 * Build-time flag. Kept a plain constant rather than an env var so it is
 * statically analysable — a false value lets the bundler drop the branch, and
 * nothing in the Screen Time path ends up in the bundle of a build that does
 * not use it.
 */
export const LOCK_FEATURE_ENABLED = true;

/** Whether the lock UI should exist at all in this build, on this platform. */
export function isLockAvailable(): boolean {
  return LOCK_FEATURE_ENABLED && Platform.OS === 'ios';
}
