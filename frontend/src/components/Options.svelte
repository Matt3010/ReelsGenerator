<script lang="ts">
  import type { JobOptions, Palette } from '../lib/api';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import PickField from './PickField.svelte';
  import Popover from './Popover.svelte';
  import Switch from './Switch.svelte';

  /**
   * Le scelte di un lavoro, in un foglietto aperto da un tasto (il modulo resta corto): lo stile delle immagini e,
   * per i video, quali limiti valgono. Il tasto dice lo stile scelto.
   */
  let { options = $bindable(), styles, video = false }: { options: JobOptions; styles: Palette['styles']; video?: boolean } = $props();

  let open = $state(false);
  let anchor = $state<HTMLElement | null>(null);
  const nome = $derived(styles.find((s) => s.id === options.style)?.label ?? options.style);
</script>

<span class="tasto" bind:this={anchor}>
  <Button look="ghost" onclick={() => (open = !open)} aria-expanded={open}>Opzioni · {nome}</Button>
</span>

{#if open && anchor}
  <Popover {anchor} width={320} height={360} look="dialog" role="dialog" label="Opzioni" onclose={() => (open = false)}>
    <div class="dentro">
      <Field label="Stile">
        <PickField label="Stile" value={options.style} options={styles} drop onpick={(id) => (options.style = id)} />
      </Field>
      {#if video}
        <Switch checked={options.realPeople} label="Persone reali"
          hint="Nomi e volti di persone vere nelle immagini (spento: solo figure generiche)"
          onchange={(v) => (options.realPeople = v)} />
        <Switch checked={options.avoid} label="Evita anacronismi"
          hint="Il modello elenca cosa non disegnare per l'epoca (auto moderne, materiali sbagliati…)"
          onchange={(v) => (options.avoid = v)} />
      {/if}
    </div>
  </Popover>
{/if}

<style>
  .tasto { display: inline-flex; }

  .dentro { display: grid; gap: 10px; }
</style>
