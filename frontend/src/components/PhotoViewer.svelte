<script lang="ts">
  import { imageUrl } from '../lib/api';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /** Un'immagine aperta: grande, il prompt da cui è nata, e il tasto per scaricarla. */
  let { id, prompt }: { id: number; prompt: string } = $props();
</script>

<img src={imageUrl(id)} alt={prompt} />
<p>{prompt}</p>
<div class="azioni">
  <Button look="ghost" size="sm" href={imageUrl(id)} download><Icon name="download" />Scarica</Button>
</div>

<style>
  img { display: block; width: 100%; border-radius: var(--r-in); background: var(--sunken); }

  p { margin: 0; font-size: 13px; color: var(--ink-2); }

  .azioni { display: flex; gap: 6px; }
</style>
