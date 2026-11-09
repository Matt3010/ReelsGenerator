<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Una scheda nella colonna di una pagina di servizio: il riquadro di vetro, scritto una volta sola. */
  let {
    wide = false,
    dashed = false,
    bare = false,
    label,
    children,
  }: {
    /** Attraverso tutte le colonne: una tabella in trecento pixel non si incolonna più. */
    wide?: boolean;
    /** Tratteggiata: il posto per una cosa che non c'è ancora, o una nota di contorno. */
    dashed?: boolean;
    /** Senza vestito, per chi ha già il suo riquadro: il posto nella colonna e basta. */
    bare?: boolean;
    /** Il nome della sezione, per chi non la vede: la card diventa una regione. */
    label?: string;
    children: Snippet;
  } = $props();
</script>

<section class="card" class:wide class:dashed class:bare aria-label={label}>
  {@render children()}
</section>

<style>
  .card {
    /* non si spezza fra due colonne: si sposta intera */
    break-inside: avoid;
    display: grid;
    /* l'altezza in più (schede in riga) resta in fondo, non fra le righe dentro */
    align-content: start;
    gap: 10px;
    min-width: 0;
    /* lo spazio fra le card lo dà la colonna (PageShell) */
    margin: 0;
    padding: var(--card-pad);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    background: var(--glass-strong);
  }

  /* attraverso tutte le colonne, in tutti e due i modi di disporle */
  .card.wide {
    column-span: all;
    grid-column: 1 / -1;
  }

  .card.bare {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
  }

  .card.dashed {
    padding: 14px;
    border-style: dashed;
    border-radius: var(--r-md);
    background: none;
  }
</style>
