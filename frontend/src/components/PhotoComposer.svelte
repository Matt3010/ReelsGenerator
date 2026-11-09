<script lang="ts">
  import type { Format, ImageModel, PhotoRequest, Resolution } from '../lib/api';
  import { FORMATI, RISOLUZIONI } from '../lib/photo';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import PickField from './PickField.svelte';
  import TextField from './TextField.svelte';

  /**
   * Un'immagine: il prompt e il negative prompt, passati al modello così come sono; sotto il formato, la risoluzione,
   * quante, e il seed (vuoto: a caso; scritto: le stesse immagini di nuovo, per ritoccare solo il prompt). In cima il modello:
   * chi non ascolta il negative prompt non lo chiede nemmeno.
   */
  let { onCreate, models }: { onCreate: (req: PhotoRequest) => Promise<void>; models: ImageModel[] } = $props();

  const QUANTE = [1, 2, 3, 4].map((n) => ({ id: String(n), label: String(n) }));

  // il primo della lista: il server mette in cima quello predefinito
  // svelte-ignore state_referenced_locally
  let model = $state(models[0]?.id ?? '');
  const scelto = $derived(models.find((m) => m.id === model));
  let prompt = $state('');
  let negative = $state('');
  let format = $state<Format>('portrait');
  let resolution = $state<Resolution>('standard');
  let count = $state(1);
  let seed = $state('');
  let sending = $state(false);
  let problem = $state('');

  /** solo cifre: un numero, o niente (a caso) */
  const seedValue = $derived(/^\d+$/.test(seed.trim()) ? Number(seed.trim()) : null);

  async function create() {
    sending = true;
    problem = '';
    try {
      await onCreate({ prompt: prompt.trim(), negative: scelto?.negative === false ? '' : negative.trim(), count, format, seed: seedValue,
        resolution, model });
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
  <Field label="Modello">
    <PickField label="Modello" value={model} options={models} drop onpick={(id) => (model = id)} />
  </Field>

  <Field label="Prompt">
    <TextField kind="multiline" label="Prompt" maxlength={2000} rows="6" bind:value={prompt}
      placeholder="Cosa deve mostrare l'immagine: soggetto, luogo, luce, stile…" />
  </Field>

  {#if scelto?.negative !== false}
    <Field label="Negative prompt">
      <TextField kind="multiline" label="Negative prompt" maxlength={2000} rows="3" bind:value={negative}
        placeholder="Cosa non deve esserci: blurry, extra fingers, text…" />
    </Field>
  {/if}

  <div class="riga">
    <Field label="Formato">
      <PickField label="Formato" value={format} options={FORMATI} drop onpick={(id) => (format = id as Format)} />
    </Field>
    <Field label="Risoluzione">
      <PickField label="Risoluzione" value={resolution} options={RISOLUZIONI} drop onpick={(id) => (resolution = id as Resolution)} />
    </Field>
    <Field label="Quante">
      <PickField label="Quante" value={String(count)} options={QUANTE} drop onpick={(id) => (count = Number(id))} />
    </Field>
    <Field label="Seed">
      <TextField label="Seed" maxlength={10} inputmode="numeric" bind:value={seed} placeholder="casuale" />
    </Field>
  </div>

  {#if problem}<Alert message={problem} />{/if}

  <Button look="primary" size="lg" onclick={create} disabled={!prompt.trim() || sending}>
    <Icon name="generate" />{count === 1 ? 'Genera immagine' : `Genera ${count} immagini`}
  </Button>
</div>

<style>
  .modulo { display: grid; gap: 12px; min-width: 0; }

  /* formato, risoluzione, quante, seed: due per riga */
  .riga { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0; }
  .riga > :global(*) { min-width: 0; }
</style>
