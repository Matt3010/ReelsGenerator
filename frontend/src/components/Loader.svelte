<script lang="ts">
  import { onDestroy } from 'svelte';

  /** La rotellina d'attesa; compare solo dopo `delay`, perché una pagina che arriva subito non lampeggi. */
  let { delay = 150 }: { delay?: number } = $props();

  let shown = $state(false);
  // svelte-ignore state_referenced_locally
  const timer = setTimeout(() => (shown = true), delay);
  onDestroy(() => clearTimeout(timer));
</script>

{#if shown}
  <div class="loader" role="status" aria-label="Caricamento…">
    <span class="wheel" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .loader { display: grid; place-items: center; padding: 32px 0; }

  .wheel {
    width: 22px;
    height: 22px;
    border: 2px solid var(--hairline);
    border-top-color: var(--ink-2);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .wheel { animation-duration: 2.4s; }
  }
</style>
