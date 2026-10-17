import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Level } from '@/lib/diagnose';
import { mono, R, S, useT } from '@/theme';

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useT();
  const inner = <View style={[styles.inner, padded && styles.padded]}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : inner}
    </SafeAreaView>
  );
}

type TxtKind = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'num' | 'bignum';
export function T({ k = 'body', style, children, color, numberOfLines, selectable }: {
  k?: TxtKind; style?: StyleProp<TextStyle>; children: ReactNode; color?: string; numberOfLines?: number; selectable?: boolean;
}) {
  const t = useT();
  const kinds: Record<TxtKind, TextStyle> = {
    h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: t.ink },
    h2: { fontSize: 20, fontWeight: '700', color: t.ink },
    h3: { fontSize: 16, fontWeight: '700', color: t.ink },
    body: { fontSize: 15, lineHeight: 21, color: t.ink },
    small: { fontSize: 13, lineHeight: 18, color: t.muted },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: t.muted },
    num: { fontSize: 15, fontFamily: mono, fontVariant: ['tabular-nums'], color: t.ink },
    bignum: { fontSize: 56, fontWeight: '700', fontFamily: mono, fontVariant: ['tabular-nums'], letterSpacing: -2, color: t.ink },
  };
  const base = kinds[k];
  return <Text selectable={selectable} numberOfLines={numberOfLines} style={[base, color ? { color } : null, style]}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useT();
  const s = [{ backgroundColor: t.surface, borderRadius: R.lg, padding: S.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line }, style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={s}>{children}</View>;
}

export function Row({ children, gap = S.sm, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: S.sm }}>
      <Row style={{ justifyContent: 'space-between' }}><T k="label">{title}</T>{right}</Row>
      {children}
    </View>
  );
}

export function levelColors(level: Level, t: ReturnType<typeof useT>) {
  return {
    good: { fg: t.good, bg: t.goodSoft },
    warn: { fg: t.warn, bg: t.warnSoft },
    bad: { fg: t.bad, bg: t.badSoft },
    none: { fg: t.muted, bg: t.surface2 },
  }[level];
}

export function Pill({ children, level = 'none', accent }: { children: ReactNode; level?: Level; accent?: boolean }) {
  const t = useT();
  const c = accent ? { fg: t.accent, bg: t.accentSoft } : levelColors(level, t);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Button({ title, onPress, kind = 'default', disabled, style, icon }: {
  title: string; onPress?: () => void; kind?: 'default' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: ReactNode;
}) {
  const t = useT();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.badSoft : kind === 'ghost' ? 'transparent' : t.surface2;
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? t.bad : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: R.md, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 6, opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        borderWidth: kind === 'default' ? StyleSheet.hairlineWidth : 0, borderColor: t.line,
      }, style]}>
      {icon}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected }} style={({ pressed }) => ({
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      backgroundColor: selected ? t.accent : t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? t.accent : t.line,
      opacity: pressed ? 0.8 : 1,
    })}>
      <Text style={{ color: selected ? t.onAccent : t.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...p }: TextInputProps & { label: string; style?: StyleProp<ViewStyle> }) {
  const t = useT();
  return (
    <View style={[{ gap: 4, flex: 1, minWidth: 0 }, style]}>
      <T k="small" style={{ fontSize: 12, fontWeight: '600' }}>{label}</T>
      <TextInput
        placeholderTextColor={t.faint}
        {...p}
        style={{ backgroundColor: t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, borderRadius: R.sm, paddingHorizontal: 11, paddingVertical: 10, color: t.ink, fontSize: 15 }}
      />
    </View>
  );
}

export function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  const t = useT();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <T k="label">{label}</T>
      <Row gap={3} style={{ alignItems: 'baseline' }}>
        <Text style={{ fontFamily: mono, fontVariant: ['tabular-nums'], fontSize: 22, fontWeight: '700', color: color ?? t.ink }}>{value}</Text>
        {unit ? <T k="small">{unit}</T> : null}
      </Row>
    </View>
  );
}

export function Divider() {
  const t = useT();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line }} />;
}

export function WatchThumb({ uri, size = 56, fill }: { uri: string | null; size?: number; fill?: boolean }) {
  const t = useT();
  const box: ViewStyle = fill ? { width: '100%', height: '100%' } : { width: size, height: size, borderRadius: size * 0.22 };
  return (
    <View style={[box, { overflow: 'hidden', backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }]}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <WatchGlyph size={fill ? 48 : size * 0.5} color={t.faint} />}
    </View>
  );
}

export function WatchGlyph({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 0.42, height: size, borderRadius: size * 0.08, backgroundColor: color, opacity: 0.35 }} />
      <View style={{ width: size * 0.78, height: size * 0.78, borderRadius: size, borderWidth: size * 0.08, borderColor: color, backgroundColor: 'transparent' }} />
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const t = useT();
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, borderRadius: R.lg, padding: S.xl, gap: S.md }}>
      <T k="h3">{title}</T>
      <T k="small">{body}</T>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { gap: S.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  padded: { paddingHorizontal: S.lg, paddingTop: S.md },
});
