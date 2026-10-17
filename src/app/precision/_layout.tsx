import { Stack } from 'expo-router';

import { useT } from '@/theme';

export default function PrecisionLayout() {
  const t = useT();
  return (
    <Stack screenOptions={{ headerTintColor: t.accent, headerStyle: { backgroundColor: t.bg }, headerTitleStyle: { color: t.ink }, contentStyle: { backgroundColor: t.bg }, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '정밀 로그' }} />
    </Stack>
  );
}
