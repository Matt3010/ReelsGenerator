<script lang="ts">
  import type { JobOptions, Palette } from '../lib/api';
  import Field from './Field.svelte';
  import PickField from './PickField.svelte';
  import Switch from './Switch.svelte';

  /** Le scelte di un lavoro: lo stile delle immagini e, per i video, quali limiti valgono. */
  let { options = $bindable(), styles, video = false }: { options: JobOptions; styles: Palette['styles']; video?: boolean } = $props();
</script>

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
