<script lang="ts">
  import { onMount } from 'svelte';
  import type { PhotoRequest, TagSet, TagSuggestions } from '../lib/api';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import PageCard from './PageCard.svelte';

  /** Solo immagini: il prompt si compone coi tag di cinque categorie, i preferiti per primi, più due parole libere. */
  let {
    loadTags,
    onCreate,
  }: {
    loadTags: () => Promise<TagSuggestions>;
    onCreate: (req: PhotoRequest) => Promise<void>;
  } = $props();

  let suggested = $state<TagSuggestions | null>(null);
  /** i tag scelti, per categoria */
  let chosen = $state<TagSet>({});
  /** quelli scritti a mano, che si aggiungono ai suggeriti della loro categoria */
  let mine = $state<TagSet>({});
  let typing = $state<Record<string, string>>({});
  let extra = $state('');
  let count = $state(2);
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

  function addOwn(cat: string) {
    const tag = (typing[cat] ?? '').trim();
    if (!tag) return;
    if (!(mine[cat] ?? []).includes(tag)) mine[cat] = [...(mine[cat] ?? []), tag];
    if (!has(cat, tag)) toggle(cat, tag);
    typing[cat] = '';
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
      await onCreate({ tags, extra: extra.trim(), count });
      chosen = {};
      extra = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }
</script>

<PageCard label="Nuove immagini">
  <h2>Nuove immagini</h2>

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
      <div class="gruppo" role="group" aria-label={cat.label}>
        <span class="eyebrow">{cat.label}</span>
        <div class="tags">
          {#each [...new Set([...(mine[cat.id] ?? []), ...cat.tags])] as tag (tag)}
            <Chip label={tag} color={has(cat.id, tag) ? 'var(--me)' : 'var(--ink-3)'} aria-pressed={has(cat.id, tag)} onclick={() => toggle(cat.id, tag)} />
          {/each}
          <input
            class="nuovo"
            aria-label={`Nuovo tag: ${cat.label}`}
            placeholder="+ nuovo"
            bind:value={typing[cat.id]}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn(cat.id); } }}
          />
        </div>
      </div>
    {/each}
  {/if}

  <label class="field">
    <span class="eyebrow">Dettagli</span>
    <input bind:value={extra} placeholder="es. holding a red umbrella" aria-label="Dettagli" />
  </label>

  <div class="anteprima">
    <span class="eyebrow">Prompt</span>
    <p aria-label="Prompt">{prompt}</p>
  </div>

  {#if problem}<Alert message={problem} />{/if}

  <div class="riga">
    <select bind:value={count} aria-label="Quante immagini">
      {#each [1, 2, 3, 4] as n (n)}<option value={n}>{n} {n === 1 ? 'immagine' : 'immagini'}</option>{/each}
    </select>
    <Button look="primary" size="lg" onclick={create} disabled={!prompt || sending}>
      <Icon name="generate" />Genera immagini
    </Button>
  </div>
</PageCard>

<style>
  .gruppo { display: grid; gap: 6px; }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

  .nuovo { width: 120px; height: 30px; padding: 0 10px; border-radius: 99px; font-size: 12.5px; }

  .anteprima { display: grid; gap: 4px; padding: 10px 12px; border-radius: var(--r-in); background: var(--sunken); }
  .anteprima p { margin: 0; min-height: 1.4em; font-size: 13px; color: var(--ink-2); }

  .riga { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
</style>
