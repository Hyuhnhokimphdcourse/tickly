import { Pressable, Text, View } from 'react-native';

import { connectDrive, useSync } from '@/lib/cloud/sync';
import { R, S, useT } from '@/theme';

/** Shown when Drive sync is on but needs a tap to reconnect (Google access tokens are short-lived). */
export function SyncBanner() {
  const t = useT();
  const s = useSync();
  if (!s.supported || !s.enabled || (s.status !== 'needs-auth' && s.status !== 'error')) return null;
  const err = s.status === 'error';
  return (
    <Pressable onPress={connectDrive} accessibilityRole="button"
      style={({ pressed }) => ({ backgroundColor: err ? t.badSoft : t.warnSoft, borderRadius: R.md, padding: S.md, opacity: pressed ? 0.8 : 1, gap: 2 })}>
      <Text style={{ color: err ? t.bad : t.warn, fontWeight: '700' }}>
        {err ? '드라이브 동기화 오류 · 눌러서 다시 연결' : `구글 드라이브 다시 연결${s.dirty ? ' · 저장 안 된 변경 있음' : ''}`}
      </Text>
      <View>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {err && s.message ? s.message : '보안을 위해 Google 연결은 짧게 유지됩니다. 한 번 누르면 이어서 저장합니다.'}
        </Text>
      </View>
    </Pressable>
  );
}
