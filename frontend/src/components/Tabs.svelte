<script lang="ts" generics="T extends string">
  /** Le linguette a pastiglia dell'app: chi le usa passa delle voci, non delle classi. */
  let {
    value,
    options,
    onpick,
    label = 'Sezioni',
  }: {
    value: T;
    /** `count`: quanti ce ne sono, accanto al nome; niente se sono zero o non si dice. */
    options: { id: T; label: string; title?: string; count?: number | undefined }[];
    onpick?: (id: T) => void;
    /** Come si chiama questo gruppo di linguette, per chi non lo vede. */
    label?: string;
  } = $props();
</script>

<div class="tabs pill" role="tablist" aria-label={label}>
  {#each options as option (option.id)}
    <button
      class="tab"
      class:is-on={value === option.id}
      type="button"
      role="tab"
      aria-selected={value === option.id}
      title={option.title}
      onclick={() => onpick?.(option.id)}
    >
      {option.label}{#if option.count}{' '}<span class="count">{option.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; align-items: center; }

  .tab {
    border: 0;
    background: none;
    text-decoration: none;
    transition: background 0.16s, color 0.16s, box-shadow 0.16s, opacity 0.16s;
  }

  .tabs.pill {
    gap: 2px;
    padding: 3px;
    border-radius: 99px;
    background: var(--sunken);
  }

  /* larghe quanto il loro testo, e quello che avanza diviso: un numero non le fa uscire */
  .tabs.pill .tab {
    flex: 1 1 auto;
    min-width: 0;
    padding: 7px;
    border-radius: 99px;
    color: var(--ink-3);
    font-size: 12.5px;
    font-weight: 540;
    white-space: nowrap;
  }

  @media (hover: hover) {
  .tabs.pill .tab:hover { color: var(--ink-2); }
}

  /* quanti, accanto al nome: più chiaro di lui, le cifre larghe uguali */
  .count { margin-left: 2px; opacity: 0.6; font-variant-numeric: tabular-nums; }

  .tabs.pill .tab.is-on {
    background: var(--glass-strong);
    color: var(--ink);
    /* una sfocatura larga uscirebbe dai 3px di bordo e si leggerebbe come meno spazio sotto */
    box-shadow: 0 1px 2px rgb(10 13 18 / 0.18);
  }

  /* Dove si tocca, una linguetta è alta quanto un dito (40px, non 32). */
</style>
