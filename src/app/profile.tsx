import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Share, Text, TextInput, View } from 'react-native';

import { Heatmap } from '@/components/charts';
import { Button, Card, Chip, Field, Row, Screen, Section, T } from '@/components/ui';
import { connectDrive, disconnectDrive, syncNow, useSync } from '@/lib/cloud/sync';
import { getApiKey, setApiKey } from '@/lib/keychain';
import { useNow } from '@/hooks/use-now';
import { exportJson, importJson, patchSettings, toggleWear, useStore } from '@/lib/store';
import { dayKey, fmtRate, watchName } from '@/lib/util';
import { mono, R, S, useT } from '@/theme';

const REFS = [
  ['tg (오픈소스 타임그래퍼) — 진폭·비트에러 정의', 'https://github.com/vacaboja/tg'],
  ['Watchscanning — 타임그래퍼 판독 기준', 'https://www.watchscanning.com/guides/how-to-read-a-timegrapher/'],
  ['Watchscanning — 자기화 진단', 'https://www.watchscanning.com/guides/magnetized-watch-fix/'],
  ['Horopedia — 일오차(daily rate) 정의', 'https://horopedia.org/rate/'],
  ['COSC — 크로노미터 인증 기준', 'https://www.cosc.swiss/chronometer-certified'],
  ['Caliber Corner — 진폭과 리프트각', 'https://calibercorner.com/amplitude/'],
] as const;

export default function ProfileScreen() {
  const t = useT();
  const { data } = useStore();
  const [key, setKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [la, setLa] = useState(String(data.settings.defaultLiftAngle));
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const sync = useSync();
  const [armOff, setArmOff] = useState(false);

  useEffect(() => { void getApiKey().then(k => { if (k) setKey(k); }); }, []);

  const watches = useMemo(() => data.watches.filter(w => !w.archived).sort((a, b) => a.order - b.order), [data.watches]);
  const now = useNow();
  const today = dayKey(now);
  const counts = useMemo(() => Object.fromEntries(Object.entries(data.wear).map(([k, v]) => [k, v.length])), [data.wear]);

  const stats = useMemo(() => {
    const wornDays: Record<string, number> = {};
    for (const ids of Object.values(data.wear)) for (const id of ids) wornDays[id] = (wornDays[id] ?? 0) + 1;
    const top = Object.entries(wornDays).sort((a, b) => b[1] - a[1])[0];
    const best = data.readings.slice().sort((a, b) => Math.abs(a.rate) - Math.abs(b.rate))[0];
    let streak = 0;
    for (let d = new Date(now); ; d.setDate(d.getDate() - 1)) { if (data.wear[dayKey(d.getTime())]?.length) streak++; else break; }
    return {
      topWatch: top ? data.watches.find(w => w.id === top[0]) : undefined, topDays: top?.[1] ?? 0,
      best, bestWatch: best ? data.watches.find(w => w.id === best.watchId) : undefined, streak,
      week: data.readings.filter(r => now - r.at < 7 * 86400e3),
    };
  }, [data, now]);

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <T k="label">Profile</T>
        <T k="h1">기록</T>
      </View>

      <Section title="오늘 착용">
        {watches.length ? (
          <Row wrap gap={S.sm}>
            {watches.map(w => <Chip key={w.id} label={watchName(w)} selected={(data.wear[today] ?? []).includes(w.id)} onPress={() => toggleWear(w.id)} />)}
          </Row>
        ) : <T k="small">컬렉션에 시계를 추가하면 착용 기록을 남길 수 있습니다.</T>}
      </Section>

      <Section title="착용 히트맵 (15주)" right={<T k="small">{`연속 ${stats.streak}일`}</T>}>
        <Card><Heatmap counts={counts} /></Card>
      </Section>

      <Section title="이번 주">
        <Card style={{ gap: S.sm }}>
          <Row style={{ justifyContent: 'space-between' }}><T>측정 횟수</T><T k="num">{`${stats.week.length}회`}</T></Row>
          <Row style={{ justifyContent: 'space-between' }}><T>평균 일오차</T><T k="num">{stats.week.length ? `${fmtRate(stats.week.reduce((s, r) => s + r.rate, 0) / stats.week.length)} s/d` : '—'}</T></Row>
          <Row style={{ justifyContent: 'space-between' }}><T>가장 많이 찬 시계</T><T k="num">{stats.topWatch ? `${watchName(stats.topWatch)} · ${stats.topDays}일` : '—'}</T></Row>
          <Row style={{ justifyContent: 'space-between' }}><T>가장 정확한 측정</T><T k="num">{stats.best && stats.bestWatch ? `${watchName(stats.bestWatch)} ${fmtRate(stats.best.rate)}` : '—'}</T></Row>
        </Card>
      </Section>

      {sync.supported ? (
        <Section title="구글 드라이브 백업·동기화">
          <Card style={{ gap: S.md }}>
            {sync.enabled ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={{ fontWeight: '700' }}>{sync.email ?? '연결됨'}</T>
                  <T k="small" color={sync.status === 'ok' ? t.good : sync.status === 'error' ? t.bad : t.warn}>
                    {sync.status === 'ok' ? '동기화됨' : sync.status === 'syncing' ? '동기화 중…' : sync.status === 'needs-auth' ? '다시 연결 필요' : '오류'}
                  </T>
                </Row>
                <T k="small">{`내 드라이브 › Tickly › tickly-data.json${sync.lastSync ? ` · 마지막 동기화 ${new Date(sync.lastSync).toLocaleString('ko-KR')}` : ''}`}</T>
                <Row gap={S.sm}>
                  {sync.status === 'needs-auth' || sync.status === 'error'
                    ? <Button style={{ flex: 1 }} kind="primary" title="다시 연결" onPress={connectDrive} />
                    : <Button style={{ flex: 1 }} title="지금 동기화" disabled={sync.status === 'syncing'} onPress={() => void syncNow()} />}
                  <Button kind="danger" title={armOff ? '정말 해제' : '연결 해제'} onPress={() => { if (!armOff) { setArmOff(true); return; } setArmOff(false); disconnectDrive(); }} />
                </Row>
              </>
            ) : (
              <>
                <T k="small">측정 기록·정밀 로그·시계 정보·사진을 내 구글 드라이브(Tickly 폴더)에 저장합니다. 폰을 바꾸거나 다른 기기에서 열어도 기록이 이어집니다. 앱이 만든 파일 외에는 접근하지 않습니다.</T>
                <Button kind="primary" title="Google 드라이브 연결" onPress={connectDrive} />
              </>
            )}
            {sync.message ? <T k="small">{sync.message}</T> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="설정">
        <Card style={{ gap: S.md }}>
          <View style={{ gap: 6 }}>
            <T style={{ fontWeight: '700' }}>Claude API 키 (AI 식별·사양 검색)</T>
            <T k="small">키는 이 기기의 키체인에만 저장됩니다. console.anthropic.com에서 발급합니다. 웹 검색 비용은 1,000회당 $10과 토큰 비용입니다.</T>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="sk-ant-…"
              placeholderTextColor={t.faint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{ backgroundColor: t.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: t.line, paddingHorizontal: 11, paddingVertical: 10, color: t.ink, fontFamily: mono }}
            />
            <Row gap={S.sm}>
              <Button style={{ flex: 1 }} kind="primary" title="키 저장" onPress={async () => {
                await setApiKey(key.trim());
                patchSettings({ apiKeySet: !!key.trim() });
                setKeyMsg(key.trim() ? '저장했습니다.' : '키를 지웠습니다.');
              }} />
              <Button title="지우기" onPress={async () => { setKey(''); await setApiKey(''); patchSettings({ apiKeySet: false }); setKeyMsg('키를 지웠습니다.'); }} />
            </Row>
            {keyMsg ? <T k="small">{keyMsg}</T> : null}
          </View>
          <Field label="AI 모델" value={data.settings.aiModel} onChangeText={v => patchSettings({ aiModel: v.trim() })} autoCapitalize="none" />
          <Row gap={S.md}>
            <Field label="기본 리프트각 °" value={la} keyboardType="decimal-pad" onChangeText={v => { setLa(v); const n = Number(v); if (n >= 30 && n <= 70) patchSettings({ defaultLiftAngle: n }); }} />
          </Row>
          <View style={{ gap: 6 }}>
            <T>측정 길이 (표준 / 롱)</T>
            <Row gap={S.sm} wrap>
              {[20, 30, 45].map(s => <Chip key={s} label={`표준 ${s}초`} selected={data.settings.standardSeconds === s} onPress={() => patchSettings({ standardSeconds: s })} />)}
              {[60, 120].map(s => <Chip key={s} label={`롱 ${s}초`} selected={data.settings.longSeconds === s} onPress={() => patchSettings({ longSeconds: s })} />)}
            </Row>
          </View>
        </Card>
      </Section>

      <Section title="백업">
        <Card style={{ gap: S.md }}>
          <T k="small">모든 기록은 이 기기에만 저장됩니다. 기기를 바꾸기 전에 백업을 내보내 보관하세요 (사진 파일은 포함되지 않습니다).</T>
          <Button title="백업 내보내기" onPress={() => void Share.share({ message: exportJson() })} />
          <TextInput
            value={importText}
            onChangeText={setImportText}
            placeholder="백업 JSON 붙여넣기"
            placeholderTextColor={t.faint}
            multiline
            style={{ minHeight: 70, backgroundColor: t.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: t.line, padding: 11, color: t.ink, fontFamily: mono, fontSize: 12 }}
          />
          <Button title="백업 불러오기" disabled={!importText.trim()} onPress={() => { const ok = importJson(importText); setImportMsg(ok ? '불러왔습니다.' : 'JSON 형식이 올바르지 않습니다.'); if (ok) setImportText(''); }} />
          {importMsg ? <T k="small">{importMsg}</T> : null}
        </Card>
      </Section>

      <Section title="측정 원리와 출처">
        <Card style={{ gap: S.sm }}>
          <T k="small">일오차 = 86400 × (공칭 비트 간격 / 측정 비트 간격 − 1). 진폭 = 리프트각 / (2·sin(π·τ/T)), τ는 첫 소리부터 마지막 소리까지의 시간, T는 밸런스 한 주기. 비트에러 = 틱·톡 반주기 차이의 절반.</T>
          {REFS.map(([title, url]) => (
            <Pressable key={url} onPress={() => void Linking.openURL(url)}>
              <Text style={{ color: t.accent, fontSize: 13 }}>{`↗ ${title}`}</Text>
            </Pressable>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
