/* I nomi dei formati e delle risoluzioni, uguali dove si sceglie e dove si rilegge. */
import type { Format, Resolution } from './api';

export const FORMATI: { id: Format; label: string }[] = [
  { id: 'portrait', label: 'Verticale 9:16' },
  { id: 'square', label: 'Quadrato 1:1' },
  { id: 'landscape', label: 'Orizzontale 16:9' },
];

export const RISOLUZIONI: { id: Resolution; label: string; note: string }[] = [
  { id: 'standard', label: 'Standard', note: '1,5 min circa' },
  { id: 'fullhd', label: 'Full HD', note: '5 min circa' },
  { id: '4k', label: '4K', note: '10 min circa' },
];

export const nomeDi = <T extends string>(list: { id: T; label: string }[], id: T | undefined) =>
  list.find((x) => x.id === id)?.label ?? id ?? '';
