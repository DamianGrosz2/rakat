/**
 * Live device heading, and an honest account of when there isn't one.
 *
 * This file exists because the two ways to get a heading wrong are both silent:
 * a dial that never moves looks identical to a dial pointed at north, and a
 * magnetic heading looks identical to a true one while being up to twenty
 * degrees out. Both would be invisible in a screenshot and wrong on a prayer
 * mat, so each gets its own state here rather than a fallback.
 *
 * The hook owns the whole question — "is the phone pointing at the Kaaba?" —
 * rather than handing raw degrees to the screen. That is partly separation of
 * concerns and partly mechanics: the aligned state has hysteresis, so it depends
 * on its own previous value, and the only place React allows that cleanly is
 * inside the subscription callback that produces the new reading.
 */

import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { angleDifference, isAligned, normalizeBearing } from './bearing.ts';

export type HeadingStatus =
  /** Still probing the hardware, or nothing to point at yet. */
  | 'checking'
  /** No magnetometer. The iOS simulator, and a few cheap Android handsets. */
  | 'unavailable'
  /** There is a compass, but the OS will not start it without a location permission. */
  | 'denied'
  /** Subscribed; the first reading has not arrived. */
  | 'waiting'
  | 'live';

export type QiblaHeading =
  | { status: Exclude<HeadingStatus, 'live'> }
  | {
      status: 'live';
      /** Device heading, degrees clockwise from true north, in [0, 360). */
      degrees: number;
      /** False when we fell back to magnetic north — the reading is then off by the local declination. */
      trueNorth: boolean;
      /** Platform calibration level: 3 high, 2 medium, 1 low, 0 or less unusable. */
      accuracy: number;
      /** Signed degrees to turn to face the qibla. Positive is clockwise. */
      delta: number;
      /** Facing the qibla, with the release band applied. See `isAligned`. */
      aligned: boolean;
    };

const CHECKING: QiblaHeading = { status: 'checking' };

/**
 * expo-location's sentinel for "I have no declination model and therefore no
 * true heading". Exactly -1 on both platforms.
 */
const TRUE_HEADING_UNAVAILABLE = -1;

/**
 * Subscribes to the device heading and reports it relative to `qibla`.
 *
 * Pass `null` when the screen has nothing to point at (no stored location):
 * starting CoreLocation's heading service costs battery and puts the location
 * arrow in the iOS status bar, which would be alarming on a screen that promises
 * we read location once and keep it.
 */
export function useQiblaHeading(qibla: number | null): QiblaHeading {
  const [state, setState] = useState<QiblaHeading>(CHECKING);

  useEffect(() => {
    if (qibla === null) return;

    let alive = true;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      // Probe the sensor BEFORE subscribing. The iOS simulator has no
      // magnetometer, and there `watchHeadingAsync` resolves happily and then
      // never calls back — so a dial wired straight to it would sit at 0°
      // looking exactly like a working compass pointed north. That is the one
      // outcome this screen must not produce, and this is the cheap way to tell
      // the difference.
      const available = await Magnetometer.isAvailableAsync().catch(() => false);
      if (!alive) return;
      if (!available) {
        setState({ status: 'unavailable' });
        return;
      }

      // Heading needs foreground location permission on both platforms — iOS
      // throws without it, Android silently registers no listener and never
      // calls back. `getForegroundPermissionsAsync` only reads the current
      // status and never prompts, so this does not break the rule that location
      // is requested only from an explicit tap in Settings.
      const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!alive) return;
      if (!permission?.granted) {
        setState({ status: 'denied' });
        return;
      }

      setState({ status: 'waiting' });

      try {
        sub = await Location.watchHeadingAsync((h) => {
          if (!alive) return;
          const degrees = resolveHeading(h);
          const delta = angleDifference(degrees, qibla);
          setState((prev) => ({
            status: 'live',
            degrees,
            trueNorth: h.trueHeading !== TRUE_HEADING_UNAVAILABLE,
            accuracy: h.accuracy,
            delta,
            // The previous aligned value is what gives `isAligned` its release
            // band, which is what stops a jittering compass flickering the
            // aligned state — and its haptic — at the boundary.
            aligned: isAligned(delta, prev.status === 'live' && prev.aligned),
          }));
        });
      } catch {
        // iOS throws here if the permission was revoked between the check above
        // and the subscribe. Nothing else reaches this branch.
        if (alive) setState({ status: 'denied' });
        return;
      }

      if (!alive) sub?.remove();
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [qibla]);

  // Nothing is updating `state` while there is no subscription, so a value left
  // over from a previous one would be stale. (`qibla` only goes null -> number
  // in practice, but reporting a stale heading is not a thing to leave to luck.)
  return qibla === null ? CHECKING : state;
}

/**
 * Picks the heading to steer by, and normalises it.
 *
 * `qiblaBearing` is measured from TRUE north. The magnetometer measures MAGNETIC
 * north, and the two differ by the local declination: about 4°E in Berlin, 13°W
 * in Seattle, over 25° in parts of Alaska and New Zealand. Comparing a magnetic
 * heading against a true bearing is a silent error of exactly that size — which
 * is to say, several times the 3° we are willing to call "aligned". So:
 *
 *   - prefer `trueHeading`, which the OS computes by applying the World
 *     Magnetic Model at the device's own position. We do not have that model and
 *     are not going to ship one;
 *   - fall back to `magHeading` only so the dial still moves, and tell the user
 *     the reading is uncorrected (see `trueNorth` on the state).
 *
 * The sentinel test is `!== -1`, NOT `< 0`, and that distinction is load
 * bearing. Android computes `(magHeading + declination) % 360` without
 * re-wrapping, so a genuinely valid true heading comes back NEGATIVE anywhere
 * declination is westerly and the device points near north — a heading of 5° in
 * Seattle yields -8. A `>= 0` guard would throw that away and silently use the
 * magnetic value instead, reintroducing the exact 13° error this function exists
 * to prevent. `normalizeBearing` puts it back into [0, 360).
 */
function resolveHeading(h: Location.LocationHeadingObject): number {
  const raw = h.trueHeading !== TRUE_HEADING_UNAVAILABLE ? h.trueHeading : h.magHeading;
  return normalizeBearing(raw);
}

/**
 * Whether the user has asked the system to reduce motion.
 *
 * A compass dial turning continuously under the hand is precisely the motion the
 * setting exists to suppress, so the screen freezes the dial and drives the text
 * instead. Duplicated from the same three lines in the home screen rather than
 * shared: `src/hooks/` belongs to another workstream this week, and three lines
 * is cheaper than a merge conflict.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  return reduceMotion;
}
