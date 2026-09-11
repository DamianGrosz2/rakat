/**
 * Coordinates, read once and kept on the device.
 *
 * Spec rule, verbatim: "Location read once and stored locally. No analytics SDK
 * that sees coordinates." So there is no watcher, no background updates, and no
 * re-request on launch — once we have a fix we keep it until the user changes
 * it. That is also the right product behaviour: prayer times move by seconds
 * across a city, and "no location nagging" is an onboarding requirement.
 *
 * Nothing in this file sends coordinates anywhere. If you ever add a call that
 * does, you have broken the app's central privacy promise and its store listing.
 */

import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState } from 'react';

import type { Coords } from '@/prayer/times';

const KEY = 'location.v1';

export type StoredLocation = {
  coords: Coords;
  /** What we show on screen: "Berlin", or "52.52, 13.41" if we never resolved a name. */
  label: string;
  /** How we got it. Manual entry is first-class, not a fallback. */
  source: 'device' | 'manual';
  savedAt: number;
};

let cached: StoredLocation | null = null;

export async function loadLocation(): Promise<StoredLocation | null> {
  if (cached) return cached;
  try {
    const raw = await Storage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as StoredLocation) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveLocation(next: StoredLocation): Promise<void> {
  cached = next;
  await Storage.setItem(KEY, JSON.stringify(next));
}

/** Rounded to ~1km. Printed only when we have no place name. */
function coordLabel(c: Coords): string {
  return `${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}`;
}

/**
 * Ask for a fix. Only ever called from an explicit tap — never on launch.
 * Returns null if permission was refused, which is a normal outcome and not an
 * error: the user can type a city instead.
 */
export async function requestDeviceLocation(): Promise<StoredLocation | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const fix = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low, // city-level is all prayer times need
  });
  const coords: Coords = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };

  // Reverse geocoding is on-device on both platforms. Best effort only — a
  // missing place name must never block having usable times.
  let label = coordLabel(coords);
  try {
    const [place] = await Location.reverseGeocodeAsync(fix.coords);
    if (place?.city) label = place.city;
    else if (place?.region) label = place.region;
  } catch {
    // keep the coordinate label
  }

  const stored: StoredLocation = { coords, label, source: 'device', savedAt: Date.now() };
  await saveLocation(stored);
  return stored;
}

export function useLocation() {
  const [location, setLocation] = useState<StoredLocation | null>(cached);
  const [ready, setReady] = useState(cached !== null);

  useEffect(() => {
    let alive = true;
    loadLocation().then((l) => {
      if (!alive) return;
      setLocation(l);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const requestDevice = useCallback(async () => {
    const next = await requestDeviceLocation();
    if (next) setLocation(next);
    return next;
  }, []);

  const setManual = useCallback(async (coords: Coords, label: string) => {
    const next: StoredLocation = { coords, label, source: 'manual', savedAt: Date.now() };
    await saveLocation(next);
    setLocation(next);
    return next;
  }, []);

  return { location, ready, requestDevice, setManual };
}
