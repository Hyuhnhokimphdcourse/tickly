import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';

import { useT } from '@/theme';

function TabButton({ children, isFocused, onPress }: TabTriggerSlotProps) {
  const t = useT();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
      <Text style={{ color: isFocused ? t.accent : t.muted, fontWeight: isFocused ? '700' : '500', fontSize: 13 }}>{children}</Text>
    </Pressable>
  );
}

export default function AppTabs() {
  const t = useT();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line }}>
          <TabTrigger name="index" href="/" asChild><TabButton>측정</TabButton></TabTrigger>
          <TabTrigger name="collection" href="/collection" asChild><TabButton>컬렉션</TabButton></TabTrigger>
          <TabTrigger name="precision" href="/precision" asChild><TabButton>정밀 로그</TabButton></TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild><TabButton>기록</TabButton></TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}
