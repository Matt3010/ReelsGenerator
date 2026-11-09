/** Porta al centro dell'elenco la voce scelta. Non `scrollIntoView`: scorrerebbe anche la pagina intorno. */
export function centra(list: HTMLElement, selector = '.is-on'): void {
  const on = list.querySelector<HTMLElement>(selector);
  if (!on) return;
  const dentro = on.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  list.scrollTop = dentro - (list.clientHeight - on.offsetHeight) / 2;
}

/** Come azione: aspetta un fotogramma, perché un foglietto prima di essere appeso alla pagina non ha misure. */
export function alCentro(list: HTMLElement): void {
  requestAnimationFrame(() => centra(list));
}
