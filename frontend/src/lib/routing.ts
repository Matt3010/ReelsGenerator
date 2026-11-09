export type Route =
  /** Dove si comincia: i video, e come se ne fa uno. */
  | { kind: 'video' }
  /** Le immagini, e come se ne fanno. */
  | { kind: 'photos' }
  /** Quanto lavora la macchina, come htop. */
  | { kind: 'system' };

export const VIDEO_PATH = '/';
export const PHOTOS_PATH = '/immagini';
export const SYSTEM_PATH = '/sistema';

/** Un percorso, e la pagina che gli corrisponde (come in SendLater). Quello che non si riconosce porta a casa. */
export function readRoute(path: string): Route {
  const clean = path.length > 1 ? path.replace(/\/$/, '') : path;
  const [, written = '', ...more] = clean.split('/');
  if (more.length > 0) return { kind: 'video' };
  if (written === 'immagini') return { kind: 'photos' };
  if (written === 'sistema') return { kind: 'system' };
  return { kind: 'video' };
}

/** L'indirizzo buono di una pagina, dato uno qualsiasi che porti lì: chi lo copia dalla barra copia sempre lo stesso. */
export function canonical(path: string): string {
  return { video: VIDEO_PATH, photos: PHOTOS_PATH, system: SYSTEM_PATH }[readRoute(path).kind];
}
