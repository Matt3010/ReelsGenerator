/**
 * Appende il nodo al corpo della pagina: un antenato con backdrop-filter fa da
 * cornice anche ai figli `position: fixed`, e li taglia.
 */
export function portal(node: HTMLElement): { destroy: () => void } {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}
