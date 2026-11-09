<script lang="ts">
  import { alCentro } from '../lib/centra';
  import { frecce } from '../lib/frecce';
  import { quasiInFondo } from '../lib/elenco';
  import type { Choice } from '../lib/table';
  import { unici } from '../lib/unici';

  /**
   * Le voci di una scelta, dentro a un foglietto.
   *
   * Sta fuori dal foglietto perché il foglietto non sa cosa contiene: qui c'è
   * solo l'elenco, con quella di adesso segnata e già sotto gli occhi quando
   * si apre — un elenco che parte dall'inizio fa cercare a mano quella che si
   * sta usando.
   */
  let {
    options,
    current,
    onpick,
    title,
    drop = false,
  }: {
    options: Choice[];
    current?: string;
    onpick: (id: string) => void;
    title?: string;
    /** In un menu a tendina: voci più alte, che si toccano col pollice. */
    drop?: boolean;
  } = $props();

  const reveal = alCentro;

  /**
   * Le voci si disegnano a pezzi, come i contatti: le prime, poi altre man mano che si scende. Due anni di giorni
   * disegnati tutti insieme sarebbero settecento tasti per sceglierne uno. Quella di adesso c'è sempre, anche lontana.
   */
  const PEZZO = 60;
  const tutte = $derived(unici(options, (one) => one.id));
  let quante = $state(PEZZO);
  const mostrate = $derived(tutte.slice(0, Math.max(quante, tutte.findIndex((one) => one.id === current) + PEZZO)));

  function onscroll(event: Event): void {
    if (quasiInFondo(event.currentTarget as HTMLElement)) quante += PEZZO;
  }
</script>

{#if title}<p class="what">{title}</p>{/if}

<div class="list" use:reveal use:frecce {onscroll}>
  {#each mostrate as option (option.id)}
    <button
      type="button"
      class="one"
      class:is-drop={drop}
      class:is-on={option.id === current}
      aria-pressed={option.id === current}
      onclick={() => onpick(option.id)}
    >
      <span class="name">{option.label}</span>
      {#if option.note}<span class="note">{option.note}</span>{/if}
    </button>
  {/each}
</div>

<style>
  /* le voci di un menu a tendina si toccano col pollice */
  .one.is-drop { min-height: 44px; align-items: center; font-size: 15px; }

  .what {
    margin: 0 2px 7px;
    font-size: 12px;
    font-weight: 560;
    letter-spacing: -0.008em;
    color: var(--ink);
  }

  /* un elenco che scorre, non una finestra che cresce: le voci possono essere
     venti, e un foglietto alto quanto lo schermo non si chiude */
  .list {
    display: grid;
    gap: 1px;
    max-height: 232px;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .one {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: var(--voce-r);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s, color 0.14s;
  }

  @media (hover: hover) {
  .one:hover { background: var(--sunken); color: var(--ink); }
}

  /* quella di adesso resta segnata: sceglierla di nuovo non è un errore, ma
     sapere qual è evita di cercarla */
  .one.is-on { background: var(--sunken); color: var(--ink); font-weight: 560; }

  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* col pallino davanti il nome prende lo spazio che avanza, e la nota
     resta in fondo a destra come senza */
  .one:has(:global(.dot)) .name { flex: 1; }

  .one :global(.dot) { align-self: center; }

  .note { flex: none; font-size: 11px; color: var(--ink-3); }
</style>
