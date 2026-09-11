import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useOnboarded } from '@/store/settings';
import { useWidgetSync } from '@/widgets/use-widget-sync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { onboarded, ready } = useOnboarded();

  // Keeps the Home Screen and Lock Screen widgets fed. Mounted once, here.
  useWidgetSync();

  /**
   * Every face is bundled; none load over the network. The app is offline-first,
   * and a prayer timetable that renders in a fallback face on a bad connection is
   * not the product. Keys here are the `fontFamily` strings used everywhere else
   * and must match `Fonts` in `@/constants/theme`.
   */
  const [fontsLoaded, fontError] = useFonts({
    'Newsreader-Regular': require('@/assets/fonts/Newsreader-Regular.ttf'),
    'Newsreader-SemiBold': require('@/assets/fonts/Newsreader-SemiBold.ttf'),
    'Archivo-Regular': require('@/assets/fonts/Archivo-Regular.ttf'),
    'Archivo-SemiBold': require('@/assets/fonts/Archivo-SemiBold.ttf'),
    'Amiri-Regular': require('@/assets/fonts/Amiri-Regular.ttf'),
    'Amiri-Bold': require('@/assets/fonts/Amiri-Bold.ttf'),
    'AmiriQuran-Regular': require('@/assets/fonts/AmiriQuran-Regular.ttf'),
  });

  useEffect(() => {
    // Hide on error too: a missing face is a bug worth seeing on screen, and a
    // splash stuck forever hides it behind something that looks like a hang.
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // First run only. `onboarded` is set when the flow ends OR is skipped, so
    // skipping is permanent — no nagging on the next launch.
    if (ready && !onboarded) router.replace('/onboarding');
  }, [ready, onboarded, router]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
