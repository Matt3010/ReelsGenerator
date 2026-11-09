<script lang="ts">
  import { imageUrl } from '../lib/api';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { ui } from '../lib/ui.svelte';

  /** Un'immagine aperta: grande, il prompt da cui è nata, i tasti per scaricarla e per eliminarla. */
  let { id, prompt, onDelete }: { id: number; prompt: string; onDelete: (id: number) => void } = $props();

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
<div class="azioni">
  <Button look="ghost" size="sm" href={imageUrl(id)} download><Icon name="download" />Scarica</Button>
  <span class="spazio"></span>
  <Button look="ghost" size="sm" tone="danger" onclick={elimina}><Icon name="trash" />Elimina</Button>
</div>

<style>
  img { display: block; width: 100%; border-radius: var(--r-in); background: var(--sunken); }

  p { margin: 0; font-size: 13px; color: var(--ink-2); }

  .azioni { display: flex; gap: 6px; }
  .spazio { flex: 1; }
</style>
