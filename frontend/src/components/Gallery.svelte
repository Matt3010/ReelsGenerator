<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  /**
   * La griglia di SendLater: quadrati attaccati fra loro come in un rullino, tanti per riga quanti ne stanno.
   * Cosa c'è in ogni quadrato lo dice `tile` (una foto, un video, un lavoro ancora in corso).
   */
  let {
    items,
    key,
    label,
    tile,
  }: {
    items: T[];
    key: (item: T) => string | number;
    label: string;
    tile: Snippet<[T]>;
  } = $props();
</script>

<ul class="grid" aria-label={label}>
  {#each items as item (key(item))}
    <li>{@render tile(item)}</li>
  {/each}
</ul>

<style>
  /* da bordo a bordo, tante per riga quante ne stanno; due pixel fra l'una e l'altra */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
