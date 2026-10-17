import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { Button, Card, Chip, Field, Pill, Row, Screen, Section, T, WatchGlyph } from '@/components/ui';
import { STANDARD_BPH } from '@/dsp/timegrapher';
import { AiError, identifyWatch, type AiWatch } from '@/lib/ai';
import { getApiKey } from '@/lib/keychain';
import { deleteWatch, saveWatch, useStore } from '@/lib/store';
import { emptyWatch, MOVEMENT_LABEL, type Movement, type Source, type SpecSource, type Watch } from '@/lib/types';
import { num } from '@/lib/util';
import { R, S, useT } from '@/theme';

type Form = Record<
  'brand' | 'model' | 'ref' | 'caliber' | 'bph' | 'liftAngle' | 'acquired' | 'lastService' | 'notes' |
  'accMin' | 'accMax' | 'pr' | 'jewels' | 'svc' | 'prMeasured',
  string
>;

const str = (v: number | null | undefined) => (v == null ? '' : String(v));

function toForm(w: Watch): Form {
  return {
    brand: w.brand, model: w.model, ref: w.ref, caliber: w.caliber, bph: str(w.bph), liftAngle: str(w.liftAngle),
    acquired: w.acquired, lastService: w.lastService, notes: w.notes, accMin: str(w.spec.accMin), accMax: str(w.spec.accMax),
    pr: str(w.spec.powerReserveH), jewels: str(w.spec.jewels), svc: str(w.spec.serviceYears), prMeasured: str(w.prMeasured),
  };
}

async function persistPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ idempotent: true, intermediates: true });
  const src = new File(uri);
  const dest = new File(dir, `${Date.now()}-${src.name || 'photo.jpg'}`);
  await src.copy(dest);
  return dest.uri;
}

export default function EditWatch() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data } = useStore();
  const original = useMemo(() => data.watches.find(w => w.id === id) ?? null, [data.watches, id]);
  const base = original ?? emptyWatch();
  const [f, setF] = useState<Form>(() => toForm(base));
  const [movement, setMovement] = useState<Movement>(base.movement);
  const [photo, setPhoto] = useState<{ uri: string; base64?: string | null; type?: string } | null>(base.photo ? { uri: base.photo } : null);
  const [specSrc, setSpecSrc] = useState<SpecSource>(base.spec.src);
  const [sources, setSources] = useState<Source[]>(base.spec.sources);
  const [ai, setAi] = useState<{ busy: boolean; msg?: string; err?: boolean; res?: AiWatch } | null>(null);
  const [armed, setArmed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const specTouched = useRef(false);

  const set = (k: keyof Form) => (v: string) => {
    setF(prev => ({ ...prev, [k]: v }));
    if (['accMin', 'accMax', 'pr', 'jewels', 'svc', 'bph', 'liftAngle'].includes(k)) specTouched.current = true;
  };

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { setAi({ busy: false, err: true, msg: '카메라 권한이 필요합니다. 설정 앱에서 허용해 주세요.' }); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const a = res.assets[0];
    setPhoto({ uri: a.uri, base64: a.base64, type: a.mimeType ?? 'image/jpeg' });
    setAi(null);
  };

  const runAi = async (withPhoto: boolean) => {
    const key = await getApiKey();
    if (!key) {
      setAi({ busy: false, err: true, msg: 'Claude API 키가 없습니다. 기록 탭 > 설정에서 키를 입력하세요.' });
      return;
    }
    abortRef.current = new AbortController();
    setAi({ busy: true });
    try {
      const res = await identifyWatch({
        apiKey: key, model: data.settings.aiModel,
        imageBase64: withPhoto ? photo?.base64 ?? null : null, imageType: photo?.type,
        hint: { brand: f.brand, model: f.model, ref: f.ref, caliber: f.caliber },
        signal: abortRef.current.signal,
      });
      // fill empty fields only; never overwrite what the user typed
      setF(prev => {
        const fill = (cur: string, v: string | number | null) => (cur.trim() ? cur : v == null ? '' : String(v));
        return {
          ...prev,
          brand: fill(prev.brand, res.brand), model: fill(prev.model, res.model), ref: fill(prev.ref, res.reference),
          caliber: fill(prev.caliber, res.caliber), bph: fill(prev.bph, res.bph), liftAngle: fill(prev.liftAngle, res.liftAngle),
          accMin: fill(prev.accMin, res.accMin), accMax: fill(prev.accMax, res.accMax), pr: fill(prev.pr, res.powerReserveH),
          jewels: fill(prev.jewels, res.jewels), svc: fill(prev.svc, res.serviceYears),
        };
      });
      if (res.movement) setMovement(res.movement);
      setSources(res.sources);
      setSpecSrc('ai');
      specTouched.current = false;
      setAi({ busy: false, res });
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      setAi({ busy: false, err: true, msg: aborted ? '검색을 멈췄습니다.' : e instanceof AiError ? e.message : '네트워크 오류로 검색하지 못했습니다.' });
    }
  };

  const save = async () => {
    if (!f.brand.trim() && !f.model.trim()) { setAi({ busy: false, err: true, msg: '브랜드나 모델 중 하나는 입력하세요.' }); return; }
    let photoUri = base.photo;
    if (photo && photo.uri !== base.photo) {
      try { photoUri = await persistPhoto(photo.uri); } catch { photoUri = photo.uri; }
    }
    if (!photo) photoUri = null;
    const src: SpecSource = specTouched.current && specSrc !== 'verified' ? 'user' : specSrc;
    const w: Watch = {
      ...base,
      brand: f.brand.trim(), model: f.model.trim(), ref: f.ref.trim(), caliber: f.caliber.trim(), movement,
      bph: num(f.bph), liftAngle: num(f.liftAngle), photo: photoUri, acquired: f.acquired.trim(), lastService: f.lastService.trim(),
      notes: f.notes.trim(), prMeasured: num(f.prMeasured),
      spec: { accMin: num(f.accMin), accMax: num(f.accMax), powerReserveH: num(f.pr), jewels: num(f.jewels), serviceYears: num(f.svc), src, sources },
    };
    const savedW = saveWatch(w);
    if (original) router.back();
    else router.replace(`/collection/${savedW.id}`);
  };

  return (
    <Screen>
      <Card style={{ gap: S.md }}>
        <Row gap={S.lg}>
          <View style={{ width: 96, height: 96, borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            {photo ? <Image source={{ uri: photo.uri }} style={{ width: 96, height: 96 }} contentFit="cover" /> : <WatchGlyph size={44} color={t.faint} />}
          </View>
          <View style={{ flex: 1, gap: S.sm }}>
            {Platform.OS !== 'web' ? <Button title="사진 찍기" onPress={() => void pick(true)} /> : null}
            <Button title={photo ? '다른 사진 선택' : '앨범에서 선택'} onPress={() => void pick(false)} />
          </View>
        </Row>
        {ai?.busy ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T k="small">웹에서 모델과 사양을 찾는 중… (보통 20–60초)</T>
            <Button kind="ghost" title="멈추기" onPress={() => abortRef.current?.abort()} />
          </Row>
        ) : (
          <Row gap={S.sm}>
            <Button style={{ flex: 1 }} kind="primary" title="사진으로 식별" disabled={!photo?.base64} onPress={() => void runAi(true)} />
            <Button style={{ flex: 1 }} title="입력값으로 사양 검색" disabled={!(f.brand || f.model || f.caliber)} onPress={() => void runAi(false)} />
          </Row>
        )}
        {ai?.msg ? <T k="small" color={ai.err ? t.bad : t.muted}>{ai.msg}</T> : null}
        {ai?.res ? (
          <View style={{ gap: 4, backgroundColor: t.accentSoft, borderRadius: R.md, padding: S.md }}>
            <T style={{ fontWeight: '700' }}>{`빈 칸을 채웠습니다${ai.res.confidence != null ? ` · 확신도 ${Math.round(ai.res.confidence * 100)}%` : ''}`}</T>
            {ai.res.basis ? <T k="small">{`근거: ${ai.res.basis}`}</T> : null}
            {ai.res.caveat ? <T k="small">{`확인 필요: ${ai.res.caveat}`}</T> : null}
          </View>
        ) : null}
        {!photo?.base64 && photo ? <T k="small">사진 식별은 새로 찍거나 고른 사진에서만 됩니다.</T> : null}
      </Card>

      <Section title="기본 정보">
        <Row gap={S.md}><Field label="브랜드" value={f.brand} onChangeText={set('brand')} /><Field label="모델" value={f.model} onChangeText={set('model')} /></Row>
        <Row gap={S.md}><Field label="레퍼런스" value={f.ref} onChangeText={set('ref')} autoCapitalize="characters" /><Field label="칼리버" value={f.caliber} onChangeText={set('caliber')} /></Row>
        <Row gap={S.sm}>
          {(Object.keys(MOVEMENT_LABEL) as Movement[]).map(m => <Chip key={m} label={MOVEMENT_LABEL[m]} selected={movement === m} onPress={() => setMovement(m)} />)}
        </Row>
      </Section>

      <Section title="타임그래퍼 설정">
        <Row gap={S.md}>
          <Field label="진동수 BPH (비우면 자동)" value={f.bph} onChangeText={set('bph')} keyboardType="number-pad" />
          <Field label="리프트각 °" value={f.liftAngle} onChangeText={set('liftAngle')} keyboardType="decimal-pad" />
        </Row>
        <Row wrap gap={6}>
          {STANDARD_BPH.filter(b => b >= 18000 && b <= 36000).map(b => <Chip key={b} label={b.toLocaleString()} selected={num(f.bph) === b} onPress={() => set('bph')(String(b))} />)}
        </Row>
      </Section>

      <Section title="무브먼트 사양" right={specSrc ? <Pill level={specSrc === 'verified' ? 'good' : 'none'}>{specSrc === 'ai' ? 'AI 검색' : specSrc === 'verified' ? '확인함' : '직접 입력'}</Pill> : null}>
        <Row gap={S.md}>
          <Field label="사양 일오차 하한 s/d" value={f.accMin} onChangeText={set('accMin')} keyboardType="numbers-and-punctuation" />
          <Field label="상한 s/d" value={f.accMax} onChangeText={set('accMax')} keyboardType="numbers-and-punctuation" />
        </Row>
        <Row gap={S.md}>
          <Field label="파워리저브 h" value={f.pr} onChangeText={set('pr')} keyboardType="decimal-pad" />
          <Field label="보석 수" value={f.jewels} onChangeText={set('jewels')} keyboardType="number-pad" />
          <Field label="권장 오버홀 (년)" value={f.svc} onChangeText={set('svc')} keyboardType="decimal-pad" />
        </Row>
        <Row wrap gap={6}>
          {[['COSC', -4, 6], ['Rolex', -2, 2], ['METAS', 0, 5]].map(([n, lo, hi]) => (
            <Chip key={n as string} label={`${n} ${lo}/+${hi}`} selected={num(f.accMin) === lo && num(f.accMax) === hi} onPress={() => { set('accMin')(String(lo)); set('accMax')(String(hi)); }} />
          ))}
        </Row>
        {sources.length ? (
          <View style={{ gap: 4 }}>
            {sources.map(s => (
              <Pressable key={s.url} onPress={() => void Linking.openURL(s.url)}><T k="small" color={t.accent} numberOfLines={1}>{`↗ ${s.title}`}</T></Pressable>
            ))}
          </View>
        ) : null}
        {specSrc === 'ai' ? <Button title="출처를 확인했습니다" onPress={() => { setSpecSrc('verified'); specTouched.current = false; }} /> : null}
      </Section>

      <Section title="상태 기록">
        <Row gap={S.md}>
          <Field label="입수일 (YYYY-MM-DD)" value={f.acquired} onChangeText={set('acquired')} placeholder="2024-05-01" />
          <Field label="최근 오버홀" value={f.lastService} onChangeText={set('lastService')} placeholder="YYYY-MM-DD" />
        </Row>
        <Field label="실측 파워리저브 h (완전히 감고 멈출 때까지)" value={f.prMeasured} onChangeText={set('prMeasured')} keyboardType="decimal-pad" />
        <Field label="메모" value={f.notes} onChangeText={set('notes')} multiline />
      </Section>

      <Row gap={S.sm}>
        <Button style={{ flex: 1 }} kind="primary" title="저장" onPress={() => void save()} />
        {original ? (
          <Button kind="danger" title={armed ? '정말 삭제' : '시계 삭제'} onPress={() => {
            if (!armed) { setArmed(true); return; }
            deleteWatch(original.id);
            router.dismissAll();
            router.replace('/collection');
          }} />
        ) : null}
      </Row>
      {photo ? <Button kind="ghost" title="사진 지우기" onPress={() => setPhoto(null)} /> : null}
    </Screen>
  );
}
