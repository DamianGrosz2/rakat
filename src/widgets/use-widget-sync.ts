import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { clearWidgetState, publishWidgetState } from '@/widgets/bridge';

/**
 * Keeps the widget's data fresh.
 *
 * Runs on mount, whenever the app comes to the foreground, and whenever the
 * settings or location change — because a method, madhab, offset or city change
 * moves every time on the widget too, and a widget showing the old institution's
 * times is worse than a widget showing nothing.
 *
 * Mounted once, from the root layout.
 */
export function useWidgetSync() {
  const { settings, ready: settingsReady } = useSettings();
  const { location, ready: locationReady } = useLocation();

  useEffect(() => {
    if (!settingsReady || !locationReady) return;

    const publish = () => {
      if (location) publishWidgetState(location.coords, settings);
      else clearWidgetState();
    };

    publish();

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') publish();
    });
    return () => sub.remove();
  }, [settingsReady, locationReady, location, settings]);
}
