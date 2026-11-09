<script lang="ts">
  import { onMount } from 'svelte';
  import type { NewPhotos, Palette, TagSet, TagSuggestions } from '../lib/api';
  import Options from './Options.svelte';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import PickField from './PickField.svelte';
  import TagGroup from './TagGroup.svelte';
  import TextField from './TextField.svelte';

  /** Solo immagini: il prompt si compone coi tag di cinque categorie, i preferiti per primi, più due parole libere. */
  let {
    palette,
    loadTags,
    onCreate,
  }: {
    palette: Palette;
    loadTags: () => Promise<TagSuggestions>;
    onCreate: (req: NewPhotos) => Promise<void>;
  } = $props();

  let suggested = $state<TagSuggestions | null>(null);
  /** i tag scelti, per categoria */
  let chosen = $state<TagSet>({});
  /** quelli scritti a mano, che si aggiungono ai suggeriti della loro categoria */
  let mine = $state<TagSet>({});
  let extra = $state('');
  let count = $state(2);
  // svelte-ignore state_referenced_locally
  let options = $state({ ...palette.defaults });
  let sending = $state(false);
  let problem = $state('');

  onMount(async () => {
    try { suggested = await loadTags(); } catch (e) { problem = e instanceof Error ? e.message : String(e); }
  });

  const has = (cat: string, tag: string) => (chosen[cat] ?? []).includes(tag);

  function toggle(cat: string, tag: string) {
    const list = chosen[cat] ?? [];
    chosen[cat] = has(cat, tag) ? list.filter((t) => t !== tag) : [...list, tag];
  }

  function addOwn(cat: string, tag: string) {
    if (!(mine[cat] ?? []).includes(tag)) mine[cat] = [...(mine[cat] ?? []), tag];
    if (!has(cat, tag)) toggle(cat, tag);
  }

  // nello stesso ordine del server: il soggetto per primo, dove il modello d'immagine guarda di più
  const prompt = $derived(
    [...(suggested?.categories ?? []).flatMap((c) => chosen[c.id] ?? []), extra.trim()].filter(Boolean).join(', '),
  );

  const recentLabel = (set: TagSet) => Object.values(set).flat().join(' · ');

  async function create() {
    sending = true;
    problem = '';
    const tags = Object.fromEntries(Object.entries(chosen).filter(([, list]) => list.length));
    try {
      await onCreate({ tags, extra: extra.trim(), count, options: { ...options } });
      chosen = {};
      extra = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }
</script>

<div class="modulo">

  {#if suggested}
    {#if suggested.recent.length}
      <div class="gruppo">
        <span class="eyebrow">Usati di recente</span>
        <div class="tags">
          {#each suggested.recent as set, i (i)}
            <Chip label={recentLabel(set)} look="off" onclick={() => (chosen = Object.fromEntries(Object.entries(set).map(([k, v]) => [k, [...v]])))} />
          {/each}
        </div>
      </div>
    {/if}

    {#each suggested.categories as cat (cat.id)}
      <TagGroup label={cat.label} tags={[...new Set([...(mine[cat.id] ?? []), ...cat.tags])]} chosen={chosen[cat.id] ?? []}
        ontoggle={(tag) => toggle(cat.id, tag)} onadd={(tag) => addOwn(cat.id, tag)} />
    {/each}
  {/if}

  <Field label="Dettagli">
    <TextField label="Dettagli" maxlength={200} bind:value={extra} placeholder="es. holding a red umbrella" />
  </Field>

  <Options bind:options styles={palette.styles} />

  <div class="anteprima">
    <span class="eyebrow">Prompt</span>
    <p aria-label="Prompt">{prompt}</p>
  </div>

  {#if problem}<Alert message={problem} />{/if}

  <div class="riga">
    <PickField label="Quante immagini" value={String(count)} drop width={160}
      options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: `${n} ${n === 1 ? 'immagine' : 'immagini'}` }))}
      onpick={(id) => (count = Number(id))} />
    <Button look="primary" size="lg" onclick={create} disabled={!prompt || sending}>
      <Icon name="generate" />Genera immagini
    </Button>
  </div>
</div>

<style>
  .modulo { display: grid; gap: 12px; min-width: 0; }
  /* nessuno più largo della finestra: un tag lungo va a capo o si taglia, non la sfonda */
  .modulo > :global(*) { min-width: 0; }

  .gruppo { display: grid; gap: 6px; min-width: 0; }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }

  .anteprima { display: grid; gap: 4px; padding: 10px 12px; border-radius: var(--r-in); background: var(--sunken); }
  .anteprima p { margin: 0; min-height: 1.4em; font-size: 13px; color: var(--ink-2); }

  .riga { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
</style>
