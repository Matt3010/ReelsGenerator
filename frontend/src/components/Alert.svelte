<script lang="ts">
  import { onMount } from 'svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /** Un guaio detto per intero: cos'è successo e, se c'è, come uscirne. */
  let {
    message,
    action,
    tone = 'danger',
  }: {
    message: string;
    action?: { label: string; run: () => void };
    /** `warn`: non è andato storto niente, ma c'è da fare qualcosa prima che vada storto. */
    tone?: 'danger' | 'warn';
  } = $props();

  /*
   * Appena compare, la pagina scorre quanto basta a vederlo sopra la barra delle sezioni,
   * ma non se così il campo in cui si sta scrivendo uscirebbe dallo schermo.
   */
  let element = $state<HTMLElement>();
  onMount(() => {
    if (!element) return;
    const box = element.getBoundingClientRect();
    const needed = box.bottom + (parseFloat(getComputedStyle(element).scrollMarginBottom) || 0) - window.innerHeight;
    if (needed <= 0) return;
    const focused = document.activeElement;
    const writing = focused instanceof HTMLElement && focused.matches('input, textarea, select') ? focused.getBoundingClientRect() : null;
    if (writing && writing.top - needed < 0) return;
    element.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
</script>

<p class="alert" class:is-warn={tone === 'warn'} role="alert" bind:this={element}>
  <Icon name="alert" tone={tone} />
  <span>{message}</span>
  {#if action}
    <Button look="pill" onclick={action.run}>{action.label}</Button>
  {/if}
</p>

<style>
  .alert {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 0;
    padding: 9px 10px 9px 12px;
    border-radius: var(--r-in);
    background: color-mix(in srgb, var(--danger) 11%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 26%, transparent);
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink);
    animation: rise 0.22s var(--ease);
    /* visto per intero vuol dire sopra la barra delle sezioni, con lo spazio di una card */
    scroll-margin-top: var(--card-pad);
    scroll-margin-bottom: calc(var(--tab-bar) + var(--card-pad));
  }

  .alert.is-warn {
    background: color-mix(in srgb, var(--warn) 13%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warn) 34%, transparent);
  }

  .alert span { flex: 1; min-width: 0; }
</style>
