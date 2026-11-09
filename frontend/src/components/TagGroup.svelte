<script lang="ts">
  import Chip from './Chip.svelte';

  /**
   * Un gruppo di tag da accendere e spegnere: il nome sopra, i tag in fila (quelli scelti in blu) e, con `onadd`,
   * un campo in fondo per aggiungerne uno proprio con Invio.
   */
  let {
    label,
    tags,
    chosen,
    ontoggle,
    onadd,
  }: {
    label: string;
    tags: string[];
    chosen: string[];
    ontoggle: (tag: string) => void;
    onadd?: (tag: string) => void;
  } = $props();

  let nuovo = $state('');

  function add(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tag = nuovo.trim();
    if (tag) onadd?.(tag);
    nuovo = '';
  }
</script>

<div class="gruppo" role="group" aria-label={label}>
  <span class="eyebrow">{label}</span>
  <div class="tags">
    {#each tags as tag (tag)}
      {@const on = chosen.includes(tag)}
      <Chip label={tag} color={on ? 'var(--me)' : 'var(--ink-3)'} aria-pressed={on} onclick={() => ontoggle(tag)} />
    {/each}
    {#if onadd}
      <input class="nuovo" aria-label={`Nuovo tag: ${label}`} placeholder="+ nuovo" maxlength="60" bind:value={nuovo} onkeydown={add} />
    {/if}
  </div>
</div>

<style>
  .gruppo { display: grid; gap: 6px; min-width: 0; }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }

  /* alto e tondo come una pastiglia: è il posto per la prossima */
  .nuovo { width: 120px; height: 30px; padding: 0 10px; border-radius: 99px; font-size: 12.5px; }
</style>
