<script lang="ts">
  import type { Choice } from '../lib/table';
  import Icon from './Icon.svelte';
  import PickList from './PickList.svelte';
  import Popover from './Popover.svelte';

  /**
   * Un valore scelto da un elenco corto.
   *
   * È il tasto che dice cosa c'è adesso — «dopo un minuto», «domani» — e si
   * apre su un foglietto con le voci possibili. Era scritto tre volte: il
   * giorno di una scena, l'attesa fra due righe, e la scelta del luogo di un
   * agente, ognuna con il suo tasto e il suo elenco.
   *
   * Due vestiti, perché due sono i posti dove serve: `field` in un modulo,
   * un campo come gli altri, `pill` dentro a una riga, dove deve pesare meno
   * di quello che la riga dice.
   */
  let {
    value,
    options,
    onpick,
    title,
    label,
    look = 'field',
    width = 210,
    drop = false,
  }: {
    value: string;
    options: Choice[];
    onpick: (id: string) => void;
    /** La domanda in cima al foglietto: «Quando parte questa riga?» */
    title?: string;
    /** Come si chiama questo tasto, per chi non lo vede. */
    label?: string;
    look?: 'field' | 'pill';
    width?: number;
    /** Un menu a tendina sotto al tasto, largo quanto lui, anche sul telefono (non un foglio dal fondo). */
    drop?: boolean;
  } = $props();

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);
  /** Il valore scelto, letto dopo il nome del tasto: «Computer, PC Matteo». */
  const letto = $props.id();

  const scelto = $derived(options.find((one) => one.id === value));

  /** Chiuso, il cursore torna al tasto: chi usa la tastiera riparte da lì. */
  function close(): void {
    open = false;
    anchor?.focus();
  }

  function choose(id: string): void {
    close();
    onpick(id);
  }
</script>

<button
  type="button"
  class="pick-field {look}"
  class:is-open={open}
  aria-label={label}
  aria-describedby={label ? letto : undefined}
  aria-expanded={open}
  title={label}
  bind:this={anchor}
  onclick={() => (open = !open)}
>
  <span class="letto" id={letto}>{scelto?.label ?? value}</span>
  {#if look === 'field'}<Icon name="expand" size="sm" tone="muted" />{/if}
</button>

{#if open && anchor}
  <Popover {anchor} width={drop ? anchor.offsetWidth : width} height={248} place={drop ? 'drop' : 'anchored'} onclose={close}>
    <PickList {options} current={value} {title} {drop} onpick={choose} />
  </Popover>
{/if}

<style>
  .pick-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
    transition: background 0.14s, border-color 0.14s, color 0.14s;
  }

  /* in un modulo è un campo come gli altri: largo quanto la colonna, alto quanto un campo di testo,
     e si tocca col pollice */
  .pick-field.field {
    box-sizing: border-box;
    width: 100%;
    height: 40px;
    justify-content: space-between;
    padding: 0 11px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-in);
    background: var(--sunken);
  }

  @media (hover: hover) {
  .pick-field.field:hover, .pick-field.field.is-open {
      background: var(--sunken-hover);
      border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    }
}

  /* dentro a una riga: pesa meno di quello che la riga dice */
  .pick-field.pill {
    justify-content: center;
    flex: none;
    height: 26px;
    min-width: 74px;
    padding: 0 9px;
    border-radius: 99px;
    background: var(--sunken);
    color: var(--ink-3);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) {
  .pick-field.pill:hover, .pick-field.pill.is-open {
      background: var(--sunken-hover);
      color: var(--ink-2);
    }
}
</style>
