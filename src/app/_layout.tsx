import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { initSync } from '@/lib/cloud/sync';
import { loadStore, useStore } from '@/lib/store';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const { loaded } = useStore();
  useEffect(() => { void loadStore(); }, []);
  useEffect(() => {
    if (!loaded) return;
    void SplashScreen.hideAsync().catch(() => {});
    initSync();
  }, [loaded]);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}
