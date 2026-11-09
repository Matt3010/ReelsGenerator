const GAP = 10;

export interface Position {
  left: number;
  top: number;
  /** Quanto può essere alto lì dove sta: se non ci sta si accorcia e scorre, invece di staccarsi dal tasto. */
  max: number;
}

/**
 * A small popover belongs to the button that opened it: centred under it, or
 * above when there is no room below. Anything else reads as "wrong place".
 */
export function placeAnchored(anchor: HTMLElement, width: number, height: number, from?: number): Position {
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, from ?? rect.left + rect.width / 2 - width / 2),
    Math.max(8, window.innerWidth - width - 8),
  );

  const sotto = window.innerHeight - rect.bottom - GAP - 8;
  const sopra = rect.top - GAP - 8;

  if (height <= sotto) return { left, top: rect.bottom + GAP, max: sotto };
  if (height <= sopra) return { left, top: rect.top - height - GAP, max: sopra };

  // non ci sta da nessuna parte: il lato più largo, e lì si accorcia
  return sotto >= sopra
    ? { left, top: rect.bottom + GAP, max: Math.max(120, sotto) }
    : { left, top: 8, max: Math.max(120, sopra) };
}
