<script lang="ts">
  import type { ImageModel, PhotoRequest } from '../lib/api';
  import { FORMATI, RISOLUZIONI, nomeDi } from '../lib/photo';

  /**
   * Con cosa sono state chieste le immagini: prompt, negative prompt, formato, risoluzione, quante, seed.
   * Per un'immagine sola (`seed`, `size`, `model`): il suo seed vero, la sua misura e il suo modello, al posto di quante.
   */
  let { photo, seed, size, model, models = [] }: {
    photo: PhotoRequest; seed?: number; size?: readonly [number, number]; model?: string; models?: ImageModel[];
  } = $props();

  /** prima della scelta del modello c'era solo DreamShaper */
  const modello = $derived(model ?? photo.model ?? 'dreamshaper');

  const righe = $derived([
    ['Modello', models.find((m) => m.id === modello)?.label ?? modello],
    ['Prompt', photo.prompt],
    ['Negative prompt', photo.negative || '—'],
    ['Formato', nomeDi(FORMATI, photo.format)],
    ['Risoluzione', nomeDi(RISOLUZIONI, photo.resolution ?? 'standard')],
    ...(seed === undefined ? [['Quante', String(photo.count)]] : []),
    ['Seed', String(seed ?? photo.seed ?? 'casuale')],
    ...(size ? [['Misura', `${size[0]}×${size[1]}`]] : []),
  ]);
</script>

<dl>
  {#each righe as [nome, valore] (nome)}
    <dt>{nome}</dt>
    <dd>{valore}</dd>
  {/each}
</dl>

<style>
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 12.5px; }
  dt { color: var(--ink-3); }
  dd { margin: 0; color: var(--ink-2); overflow-wrap: anywhere; user-select: text; }
</style>
