import { NativeTabs } from 'expo-router/native-tabs';

import { useT } from '@/theme';

export default function AppTabs() {
  const t = useT();
  return (
    <NativeTabs tintColor={t.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>측정</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'waveform', selected: 'waveform' }} md={{ default: 'graphic_eq', selected: 'graphic_eq' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collection">
        <NativeTabs.Trigger.Label>컬렉션</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'grid_view', selected: 'grid_view' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="precision">
        <NativeTabs.Trigger.Label>정밀 로그</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.xyaxis.line', selected: 'chart.xyaxis.line' }} md={{ default: 'show_chart', selected: 'show_chart' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>기록</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md={{ default: 'person', selected: 'person' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
