import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#EEF1F5', surface: '#FFFFFF', surface2: '#F6F8FB', ink: '#14213A', muted: '#5A6477', faint: '#8A93A3', line: '#D5DBE4',
  accent: '#2347A8', accentSoft: '#DCE4F7', onAccent: '#FFFFFF',
  toc: '#B4540A',
  good: '#1D7748', goodSoft: '#DDF0E5', warn: '#A56300', warnSoft: '#F7EAD3', bad: '#B0281F', badSoft: '#F7DEDB',
  scope: '#0E1726', scopeGrid: '#22314A', scopeInk: '#9FE3C4', scopeToc: '#F2B66D',
};
const dark: typeof light = {
  bg: '#0B1017', surface: '#141B26', surface2: '#1A2230', ink: '#E4E9F1', muted: '#93A0B4', faint: '#6B778A', line: '#263041',
  accent: '#7E9DEB', accentSoft: '#1F2C4C', onAccent: '#0B1017',
  toc: '#F2A65A',
  good: '#5BC38B', goodSoft: '#163024', warn: '#E3A63C', warnSoft: '#33270F', bad: '#F27B70', badSoft: '#3A1B19',
  scope: '#070B11', scopeGrid: '#1B2638', scopeInk: '#9FE3C4', scopeToc: '#F2B66D',
};
export type Palette = typeof light;

export function useT(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const mono = Platform.select({ ios: 'Menlo', web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: 'monospace' });
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, xl: 22 } as const;
