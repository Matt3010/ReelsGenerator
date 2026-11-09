<script lang="ts">
  /**
   * Prima e dopo: la foto di partenza sopra l'immagine nata da lei, tagliata dove dice il cursore (a sinistra il prima,
   * a destra il dopo). Le due hanno la stessa forma: la partenza è stata ritagliata così prima di disegnare.
   */
  let { before, after, alt }: { before: string; after: string; alt: string } = $props();

  /** quanto prima si vede, da sinistra (0-100) */
  let split = $state(50);
</script>

<div class="confronto">
  <img class="dopo" src={after} alt={`Dopo: ${alt}`} />
  <div class="prima" style:clip-path={`inset(0 ${100 - split}% 0 0)`}>
    <img src={before} alt={`Prima: ${alt}`} />
  </div>
  <span class="linea" style:left={`${split}%`} aria-hidden="true"></span>
  <span class="etichetta sx" aria-hidden="true">Prima</span>
  <span class="etichetta dx" aria-hidden="true">Dopo</span>
  <input type="range" min="0" max="100" bind:value={split} aria-label="Prima e dopo" />
</div>

<style>
  .confronto { position: relative; border-radius: var(--r-in); overflow: hidden; background: var(--sunken); }

  img { display: block; width: 100%; }
  .prima { position: absolute; inset: 0; }
  /* la partenza riempie lo stesso riquadro, ritagliata come è stata ritagliata per disegnare */
  .prima img { width: 100%; height: 100%; object-fit: cover; }

  .linea { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 6px rgb(0 0 0 / 0.6); pointer-events: none; }

  .etichetta { position: absolute; top: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; color: #fff; background: rgb(0 0 0 / 0.55); pointer-events: none; }
  .sx { left: 8px; }
  .dx { right: 8px; }

  /* il cursore copre tutta l'immagine: si trascina dove si vuole, col dito o col mouse */
  input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
</style>
