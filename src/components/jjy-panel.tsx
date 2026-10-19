import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, Row, T } from '@/components/ui';
import { jjySupported, startJjy, type JjySession } from '@/audio/jjy';
import { mono, S, useT } from '@/theme';

const TAG = 'jjy';
const SYM_LABEL: Record<string, string> = { M: '마커', '0': '0', '1': '1' };

/** Radio-controlled watch sync: plays a JJY timecode whose 3rd harmonic sits on 40/60 kHz. */
export function JjyPanel() {
  const t = useT();
  const [carrier, setCarrier] = useState<40 | 60>(60);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<ReturnType<JjySession['status']>>(null);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<JjySession | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => { ref.current?.stop(); void deactivateKeepAwake(TAG).catch(() => {}); }, []);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setStatus(ref.current?.status() ?? null);
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      ref.current?.stop();
      ref.current = null;
      setRunning(false);
      void deactivateKeepAwake(TAG).catch(() => {});
      return;
    }
    ref.current = startJjy(carrier); // synchronous inside the tap (iOS WebKit)
    startedAt.current = Date.now();
    setElapsed(0);
    setRunning(true);
    void activateKeepAwakeAsync(TAG).catch(() => {});
  };

  if (!jjySupported) return <T k="small">웹 버전에서만 지원됩니다.</T>;
  const jst = status ? new Date(status.minuteMs + 9 * 3600e3) : null;
  return (
    <Card style={{ gap: S.md }}>
      <Row wrap gap={S.sm}>
        <Chip label="60 kHz (하가네야마·규슈)" selected={carrier === 60} onPress={() => !running && setCarrier(60)} />
        <Chip label="40 kHz (오타카도야·후쿠시마)" selected={carrier === 40} onPress={() => !running && setCarrier(40)} />
      </Row>
      <Button kind={running ? 'default' : 'primary'} title={running ? '송출 중지' : 'JJY 송출 시작'} onPress={toggle} />
      {running && status && jst ? (
        <View style={{ gap: 2 }}>
          <T style={{ fontFamily: mono }}>
            {`${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')} 프레임 · ${String(status.second).padStart(2, '0')}초 · ${SYM_LABEL[status.symbol] ?? status.symbol}`}
          </T>
          <T k="small" color={t.muted}>{`송출 ${Math.floor(elapsed / 60)}분 ${elapsed % 60}초 — 수신에 보통 3~10분 걸립니다`}</T>
        </View>
      ) : null}
      <T k="small">
        {'1) 유선 이어폰 연결(아이폰은 USB-C/라이트닝 젠더) · 무음 모드 해제 · 볼륨 최대\n'
          + '2) 이어폰 선을 시계에 감거나 이어폰 유닛을 시계 바로 옆에 둡니다\n'
          + '3) 시계를 강제 수신 모드로 (G-SHOCK: 보통 수신 버튼 길게 → RC/READY)\n'
          + '4) 화면을 켠 채로 수신 완료까지 기다립니다. 폰 시간(자동 설정)이 기준입니다.'}
      </T>
      <T k="small" color={t.muted}>원리: 20 kHz(또는 13.333 kHz) 소리의 3차 고조파가 60/40 kHz가 되어 이어폰 선에서 아주 약한 장파로 나옵니다. 기기·이어폰에 따라 안 될 수 있습니다.</T>
    </Card>
  );
}
