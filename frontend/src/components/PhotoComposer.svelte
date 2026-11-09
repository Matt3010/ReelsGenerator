<script lang="ts">
  import type { PhotoRequest } from '../lib/api';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';

  /** Un'immagine: il prompt e il negative prompt, scritti come si vuole e passati al modello così come sono. */
  let { onCreate }: { onCreate: (req: PhotoRequest) => Promise<void> } = $props();

  let prompt = $state('');
  let negative = $state('');
  let sending = $state(false);
  let problem = $state('');

  async function create() {
    sending = true;
    problem = '';
    try {
      await onCreate({ prompt: prompt.trim(), negative: negative.trim(), count: 1 });
      prompt = '';
      negative = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }
</script>

<div class="modulo">
  <Field label="Prompt">
    <TextField kind="multiline" label="Prompt" maxlength={2000} rows="6" bind:value={prompt}
      placeholder="Cosa deve mostrare l'immagine: soggetto, luogo, luce, stile…" />
  </Field>

  <Field label="Negative prompt">
    <TextField kind="multiline" label="Negative prompt" maxlength={2000} rows="3" bind:value={negative}
      placeholder="Cosa non deve esserci: blurry, extra fingers, text…" />
  </Field>

  {#if problem}<Alert message={problem} />{/if}

  <Button look="primary" size="lg" onclick={create} disabled={!prompt.trim() || sending}>
    <Icon name="generate" />Genera immagine
  </Button>
</div>

<style>
  .modulo { display: grid; gap: 12px; min-width: 0; }
</style>
