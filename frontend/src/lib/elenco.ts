/**
 * Un elenco lungo si disegna a pezzi: quando chi scorre è vicino al fondo, ne arriva un altro. Vicino vuol dire con
 * meno di mezza finestra ancora sotto, così il pezzo dopo c'è prima che ci si arrivi.
 */
export const quasiInFondo = ({ scrollHeight, scrollTop, clientHeight }: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>): boolean =>
  scrollHeight - scrollTop - clientHeight < clientHeight / 2;
