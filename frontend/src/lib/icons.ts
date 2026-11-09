import { Check, CircleAlert, Clapperboard, Download, FileText, Image, Newspaper, RotateCcw, Sparkles, X } from 'lucide';

/* Le icone che l'app disegna, e nessun'altra: chi ne vuole una nuova la aggiunge qui. */
export const ICONS = {
  logo: Clapperboard,
  news: Newspaper,
  generate: Sparkles,
  photo: Image,
  download: Download,
  script: FileText,
  again: RotateCcw,
  alert: CircleAlert,
  check: Check,
  close: X,
} as const;

export type IconName = keyof typeof ICONS;
