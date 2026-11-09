import { Check, ChevronDown, CircleAlert, Clapperboard, Download, Eye, EyeOff, FileText, Gauge, Image, Newspaper, RotateCcw, Sparkles, Trash2, X } from 'lucide';

/* Le icone che l'app disegna, e nessun'altra: chi ne vuole una nuova la aggiunge qui. */
export const ICONS = {
  logo: Clapperboard,
  news: Newspaper,
  generate: Sparkles,
  photo: Image,
  system: Gauge,
  download: Download,
  script: FileText,
  again: RotateCcw,
  alert: CircleAlert,
  check: Check,
  expand: ChevronDown,
  eye: Eye,
  eyeOff: EyeOff,
  close: X,
  trash: Trash2,
} as const;

export type IconName = keyof typeof ICONS;
