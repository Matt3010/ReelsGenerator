<script lang="ts">
  import type { NewJob, NewsItem } from '../lib/api';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import PageCard from './PageCard.svelte';
  import Switch from './Switch.svelte';

  /** Il nuovo video: una notizia di oggi o un argomento scritto a mano, la voce, i sottotitoli. */
  let {
    voices,
    loadNews,
    onCreate,
  }: {
    voices: Record<string, string>;
    loadNews: () => Promise<NewsItem[]>;
    onCreate: (job: NewJob) => Promise<void>;
  } = $props();

  let topic = $state('');
  let voice = $state('en-US-GuyNeural');
  let captions = $state(true);
  /** la notizia da cui nasce il video: si perde appena l'argomento si scrive a mano */
  let picked = $state<NewsItem | null>(null);
  let news = $state<NewsItem[] | null>(null);
  let reading = $state(false);
  let sending = $state(false);
  let problem = $state('');

  async function readNews() {
    reading = true;
    try {
      news = await loadNews();
    } catch {
      news = [];
    } finally {
      reading = false;
    }
  }

  function pick(item: NewsItem) {
    topic = item.title;
    picked = item;
  }

  async function create() {
    sending = true;
    problem = '';
    try {
      await onCreate({ topic: topic.trim(), voice, captions, news: picked });
      topic = '';
      picked = null;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }
</script>

<PageCard label="Nuovo video">
  <h2>Nuovo video</h2>
  <label class="field">
    <span class="eyebrow">Argomento</span>
    <textarea
      bind:value={topic}
      oninput={() => (picked = null)}
      placeholder="Scegli una notizia di oggi o scrivi un argomento"
      rows="2"
    ></textarea>
  </label>

  {#if picked}
    <p class="fonte"><Icon name="news" size="sm" tone="muted" /> Fonte: <b>{picked.outlet}</b> · <a href={picked.url} target="_blank" rel="noreferrer">articolo</a></p>
  {/if}

  <div class="riga">
    <Button look="ghost" onclick={readNews} disabled={reading}>
      <Icon name="news" />{reading ? 'Leggo i giornali…' : 'Notizie di oggi'}
    </Button>
    <label class="voce">
      <span class="sr">Voce</span>
      <select bind:value={voice} aria-label="Voce">
        {#each Object.entries(voices) as [id, name] (id)}
          <option value={id}>{name}</option>
        {/each}
      </select>
    </label>
  </div>

  <Switch checked={captions} label="Sottotitoli" hint="Le parole a schermo mentre la voce le dice" onchange={(v) => (captions = v)} />

  {#if news}
    {#if news.length}
      <div class="notizie">
        {#each news as item (item.url)}
          <Chip label={`${item.outlet} · ${item.title}`} color={picked?.url === item.url ? 'var(--me)' : 'var(--ink-3)'} aria-pressed={picked?.url === item.url} onclick={() => pick(item)} />
        {/each}
      </div>
    {:else}
      <p class="vuoto">Nessuna notizia disponibile adesso.</p>
    {/if}
  {/if}

  {#if problem}<Alert message={problem} />{/if}

  <Button look="primary" size="lg" onclick={create} disabled={!topic.trim() || sending}>
    <Icon name="generate" />Genera video
  </Button>
</PageCard>

<style>
  .riga { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .voce { flex: 1; min-width: 180px; }
  .voce select { width: 100%; }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .fonte { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; color: var(--ink-2); }
  .fonte a { color: var(--ink-2); }

  .notizie { display: flex; flex-wrap: wrap; gap: 6px; }

  .vuoto { margin: 0; font-size: 12.5px; color: var(--ink-3); }
</style>
