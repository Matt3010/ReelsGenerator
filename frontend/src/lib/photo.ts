/* I nomi dei formati e delle risoluzioni, uguali dove si sceglie e dove si rilegge. */
import type { Format, Resolution } from './api';

export const FORMATI: { id: Format; label: string }[] = [
  { id: 'portrait', label: 'Verticale 9:16' },
  { id: 'square', label: 'Quadrato 1:1' },
  { id: 'landscape', label: 'Orizzontale 16:9' },
];

export const RISOLUZIONI: { id: Resolution; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'fullhd', label: 'Full HD' },
  { id: '4k', label: '4K' },
];

/** le risoluzioni con accanto quanto ci mette il modello: «2,5 min circa» */
export const risoluzioniPer = (minutes: Record<Resolution, number> | undefined) =>
  RISOLUZIONI.map((r) => (minutes ? { ...r, note: `${String(minutes[r.id]).replace('.', ',')} min circa` } : r));

export const nomeDi = <T extends string>(list: { id: T; label: string }[], id: T | undefined) =>
  list.find((x) => x.id === id)?.label ?? id ?? '';
