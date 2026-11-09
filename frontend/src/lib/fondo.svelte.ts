import { getContext, onDestroy, setContext } from 'svelte';
import type { ModalAction } from './ui.svelte';

/* Il fondo di una finestra, detto da chi ci sta dentro: i tasti, che cambiano con lui, e se c'è qualcosa di non salvato. Da gymlog. */

const CHIAVE = Symbol('il fondo della finestra');

interface Fondo {
  detta: (azioni: () => ModalAction[]) => void;
  /** Si fa dire se c'è qualcosa di scritto e non salvato; torna come smettere. */
  modifiche: (quando: () => boolean) => () => void;
}

/** Lo apre il guscio, `Modal.svelte`, che di cosa ci finirà dentro non sa niente. */
export function offriIlFondo(fondo: Fondo): void {
  setContext(CHIAVE, fondo);
}

/** I tasti in fondo: un modo di ricavarli, che il guscio richiama quando qualcosa dentro si muove. */
export function tasti(azioni: () => ModalAction[]): void {
  getContext<Fondo>(CHIAVE).detta(azioni);
}

/** Prima di chiudersi la finestra chiede, se questo dice di sì. */
export function modifiche(quando: () => boolean): void {
  onDestroy(getContext<Fondo>(CHIAVE).modifiche(quando));
}
