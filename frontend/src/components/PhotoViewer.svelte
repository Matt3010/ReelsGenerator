<script lang="ts">
  import { imageUrl, type PictureInfo } from '../lib/api';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { ui } from '../lib/ui.svelte';

  /** Un'immagine aperta: grande, il prompt da cui è nata, i tasti per scaricarla e per eliminarla. */
  let {
    id,
    prompt,
    onDelete,
    loadInfo,
  }: { id: number; prompt: string; onDelete: (id: number) => void; loadInfo: (id: number) => Promise<PictureInfo | null> } = $props();

  /** il seed (per rifarla) e la misura, appena arrivano */
  let info = $state<PictureInfo | null>(null);
  $effect(() => { void loadInfo(id).then((i) => (info = i)).catch(() => {}); });

  /** si chiede accanto al tasto, come in SendLater: è una cosa che non torna indietro */
  function elimina(event: MouseEvent) {
    ui.askSure(event.currentTarget as HTMLElement, {
      title: "Eliminare l'immagine?",
      detail: 'Si cancella per sempre, anche dalla libreria.',
      verb: 'Elimina',
      onYes: () => onDelete(id),
    });
  }
</script>

<img src={imageUrl(id)} alt={prompt} />
<p>{prompt}</p>
{#if info}<p class="dati">Seed {info.seed} · {info.width}×{info.height}</p>{/if}
<div class="azioni">
  <Button look="ghost" size="sm" href={imageUrl(id)} download><Icon name="download" />Scarica</Button>
  <span class="spazio"></span>
  <Button look="ghost" size="sm" tone="danger" onclick={elimina}><Icon name="trash" />Elimina</Button>
</div>

<style>
  img { display: block; width: 100%; border-radius: var(--r-in); background: var(--sunken); }

  p { margin: 0; font-size: 13px; color: var(--ink-2); }
  .dati { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; user-select: all; }

  .azioni { display: flex; gap: 6px; }
  .spazio { flex: 1; }
</style>
