/** Quanto aspettare prima di riaprire una connessione che il browser ha chiuso per sempre. */
const RIPROVA_MS = 5_000;
/** `EventSource.CLOSED`: il browser non ci riprova più da solo. */
const CHIUSA = 2;

/**
 * Segue gli eventi del server (`/api/events`): `onChange` a ogni «qualcosa è cambiato», a ogni
 * collegamento (anche dopo che il browser si è ricollegato da solo: quello che è cambiato intanto
 * non si perde) e quando la pagina torna in vista. Una risposta di errore (un deploy, un 502) il browser
 * la prende per definitiva e non si ricollega più: allora se ne apre una nuova poco dopo. Torna come smettere.
 */
export function follow(onChange: () => void, Source: typeof EventSource = EventSource, doc: Document = document): () => void {
  let source: EventSource;
  let riprova: ReturnType<typeof setTimeout> | undefined;
  const apri = (): void => {
    source = new Source('/api/events');
    source.addEventListener('message', onChange);
    source.addEventListener('open', onChange);
    source.addEventListener('error', () => {
      if (source.readyState === CHIUSA) riprova = setTimeout(apri, RIPROVA_MS);
    });
  };
  apri();
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') onChange();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearTimeout(riprova);
    source.close();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
