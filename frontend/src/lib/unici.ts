/**
 * Una voce per chiave, la prima: un `{#each}` con una chiave ripetuta fa cadere la pagina
 * intera, anche in produzione, e gli elenchi che non scriviamo noi possono ripetersi.
 */
export function unici<T>(voci: readonly T[] | null | undefined, chiave: (voce: T) => unknown): T[] {
  if (!Array.isArray(voci)) return [];
  const viste = new Set<unknown>();
  return voci.filter((voce) => {
    const quale = chiave(voce);
    if (viste.has(quale)) return false;
    viste.add(quale);
    return true;
  });
}
