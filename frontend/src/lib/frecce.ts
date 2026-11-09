/** I tasti che portano da una voce all'altra di un elenco di scelte. */
const MOSSE: Record<string, (at: number, last: number) => number> = {
  ArrowDown: (at, last) => Math.min(at + 1, last),
  ArrowUp: (at) => Math.max(at - 1, 0),
  Home: () => 0,
  End: (_at, last) => last,
};

/**
 * Un elenco di scelte usabile dalla tastiera: aperto, il cursore va sulla voce scelta (o sulla prima), e le frecce,
 * Inizio e Fine lo portano fra le voci. Chi non usa il mouse ci arriva e sceglie, anche dentro una finestra.
 */
export function frecce(list: HTMLElement, { prende = true }: { prende?: boolean } = {}): { destroy(): void } {
  const voci = () => [...list.querySelectorAll<HTMLElement>('button')];
  // una seconda colonna accanto alla prima (i minuti accanto alle ore) non lo prende; e lo prende appena dopo: il
  // foglietto si sposta in fondo alla pagina (portal), e un elemento spostato perde il cursore
  if (prende) queueMicrotask(() => (voci().find((one) => one.getAttribute('aria-pressed') === 'true') ?? voci()[0])?.focus());
  const onKeydown = (event: KeyboardEvent): void => {
    const mossa = MOSSE[event.key];
    if (!mossa) return;
    event.preventDefault();
    const tutte = voci();
    tutte[mossa(tutte.indexOf(document.activeElement as HTMLElement), tutte.length - 1)]?.focus();
  };
  list.addEventListener('keydown', onKeydown);
  return { destroy: () => list.removeEventListener('keydown', onKeydown) };
}
