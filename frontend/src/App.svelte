<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Composer from './components/Composer.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import Icon from './components/Icon.svelte';
  import JobCard from './components/JobCard.svelte';
  import Loader from './components/Loader.svelte';
  import PageCard from './components/PageCard.svelte';
  import PhotoComposer from './components/PhotoComposer.svelte';
  import Tabs from './components/Tabs.svelte';
  import { api, type JobInfo, type NewJob, type NewPhotos, type Palette } from './lib/api';

  let voices = $state<Record<string, string>>({ 'en-US-GuyNeural': 'Guy (US, deep narrator)' });
  let jobs = $state<JobInfo[] | null>(null);
  /** gli stili e le scelte di partenza, dal server: i compositori aspettano lui */
  let palette = $state<Palette | null>(null);

  const refresh = async () => {
    try { jobs = await api.jobs(); } catch { /* the API is starting: the next round will tell */ }
  };

  async function create(job: NewJob) {
    await api.create(job);
    await refresh();
  }

  async function createPhotos(req: NewPhotos) {
    await api.photos(req);
    await refresh();
  }

  let tab = $state<'video' | 'photo'>('video');
  // ogni scheda i suoi: i video sotto Video, le immagini sotto Immagini
  const shown = $derived(jobs?.filter((j) => (j.kind === 'photo') === (tab === 'photo')) ?? null);

  async function retry(id: string) {
    await api.retry(id);
    await refresh();
  }

  // a video takes minutes: a look every few seconds is plenty
  let timer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    void api.voices().then((v) => (voices = v)).catch(() => {});
    void api.styles().then((p) => (palette = p)).catch(() => {});
    void refresh();
    timer = setInterval(refresh, 4000);
  });
  onDestroy(() => clearInterval(timer));
</script>

<main>
  <header>
    <span class="logo"><Icon name="logo" size="lg" /></span>
    <div>
      <h1>AI Shorts</h1>
      <p>Short verticali e immagini generati con l'AI.</p>
    </div>
  </header>

  <div class="schede">
    <Tabs label="Cosa fare" value={tab} options={[{ id: 'video', label: 'Video' }, { id: 'photo', label: 'Immagini' }]} onpick={(id) => (tab = id)} />
  </div>

  {#if !palette}
    <Loader />
  {:else if tab === 'video'}
    <Composer {voices} {palette} loadNews={api.news} onCreate={create} />
  {:else}
    <PhotoComposer {palette} loadTags={api.tags} onCreate={createPhotos} />
  {/if}

  <h2 class="titolo">{tab === 'photo' ? 'Le tue immagini' : 'I tuoi video'}</h2>
  {#if shown && shown.length === 0}
    <PageCard dashed>
      {#if tab === 'photo'}
        <EmptyState title="Ancora nessuna immagine" line="Scegli qualche tag e premi Genera immagini: un minuto o due per immagine." />
      {:else}
        <EmptyState title="Ancora nessun video" line="Scegli una notizia di oggi e premi Genera video: ci vogliono una ventina di minuti." />
      {/if}
    </PageCard>
  {:else if shown}
    <div class="griglia">
      {#each shown as job (job.id)}
        <JobCard {job} onRetry={retry} loadStory={api.story} />
      {/each}
    </div>
  {/if}
</main>

<style>
  main {
    display: grid;
    gap: 14px;
    width: min(100%, var(--page-max));
    margin: 0 auto;
    padding: max(18px, env(safe-area-inset-top)) var(--island-side) 40px;
  }

  header { display: flex; align-items: center; gap: 12px; padding: 4px 2px; }

  .logo {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: var(--r-md);
    background: var(--accent-grad);
    color: var(--on-accent);
    box-shadow: var(--shadow-1);
  }

  h1 { margin: 0; font-size: 20px; font-weight: 680; letter-spacing: -0.024em; }

  header p { margin: 0; font-size: 12.5px; color: var(--ink-3); }

  .schede { width: min(100%, 260px); }

  .titolo { margin-top: 10px; padding: 0 2px; }

  .griglia { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
</style>
