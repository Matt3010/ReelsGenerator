<script lang="ts">
  import { onMount } from 'svelte';
  import Button from './components/Button.svelte';
  import Composer from './components/Composer.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import Gallery from './components/Gallery.svelte';
  import Icon from './components/Icon.svelte';
  import JobCard from './components/JobCard.svelte';
  import JobTile from './components/JobTile.svelte';
  import Loader from './components/Loader.svelte';
  import Modal from './components/Modal.svelte';
  import PageCard from './components/PageCard.svelte';
  import PhotoComposer from './components/PhotoComposer.svelte';
  import PhotoTile from './components/PhotoTile.svelte';
  import PhotoViewer from './components/PhotoViewer.svelte';
  import SurePopover from './components/SurePopover.svelte';
  import TabBar from './components/TabBar.svelte';
  import { api, imageUrl, type JobInfo, type NewJob, type Palette, type PhotoRequest } from './lib/api';
  import { follow } from './lib/events';
  import { nav } from './lib/nav.svelte';
  import { ui } from './lib/ui.svelte';

  let voices = $state<Record<string, string>>({ 'en-US-GuyNeural': 'Guy (US, deep narrator)' });
  let jobs = $state<JobInfo[] | null>(null);
  /** gli stili e le scelte di partenza, dal server: i compositori aspettano lui */
  let palette = $state<Palette | null>(null);

  const refresh = async () => {
    try { jobs = await api.jobs(); } catch { /* the API is starting: the next round will tell */ }
  };

  // partito il lavoro, la finestra si chiude e lui compare nella griglia
  async function create(job: NewJob) {
    await api.create(job);
    ui.closeModal();
    await refresh();
  }

  async function createPhotos(req: PhotoRequest) {
    await api.photos(req);
    ui.closeModal();
    await refresh();
  }

  function nuovo() {
    if (!palette) return;
    if (tab === 'video') ui.openModal({ title: 'Nuovo video', view: Composer, props: { voices, palette, loadNews: api.news, onCreate: create } });
    else ui.openModal({ title: 'Nuova immagine', view: PhotoComposer, props: { onCreate: createPhotos } });
  }

  const apri = (job: JobInfo) =>
    // un lavoro di immagini si chiama così: il suo prompt intero non sta in una testata
    ui.openModal({ title: job.kind === 'photo' ? 'Immagini' : job.title ?? job.topic, view: JobCard, props: { job, onRetry: retry, onDelete: remove, loadStory: api.story } });

  const apriFoto = (id: number) =>
    ui.openModal({ title: 'Immagine', view: PhotoViewer, props: { id, prompt: pictures.find((p) => p.id === id)?.alt ?? '', onDelete: removePicture, loadInfo: api.picture } });

  /** la pagina la dice l'indirizzo: / i video, /immagini le immagini */
  const tab = $derived(nav.route.kind === 'photos' ? 'photo' : 'video');
  // ogni scheda i suoi: i video sotto Video, le immagini sotto Immagini
  const shown = $derived(jobs?.filter((j) => (j.kind === 'photo') === (tab === 'photo')) ?? null);
  // le immagini finite nella galleria, le più nuove prima; i lavori ancora aperti restano riquadri sopra
  const tiles = $derived(tab === 'photo' ? shown?.filter((j) => j.state !== 'done') ?? [] : shown ?? []);
  const pictures = $derived(tab === 'photo'
    ? (shown ?? []).filter((j) => j.state === 'done').flatMap((j) => (j.images ?? []).map((id) => ({ id, url: imageUrl(id), alt: j.topic })))
    : []);

  async function retry(id: string) {
    await api.retry(id);
    ui.closeModal();
    await refresh();
  }

  // eliminato, la finestra si chiude; la griglia la aggiorna l'evento del server
  async function remove(id: string) {
    await api.remove(id);
    ui.closeModal();
  }

  async function removePicture(id: number) {
    await api.removePicture(id);
    ui.closeModal();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') ui.escape();
  }

  // il server dice quando qualcosa cambia (SSE): allora, e quando ci si ricollega, si rilegge
  onMount(() => {
    void api.voices().then((v) => (voices = v)).catch(() => {});
    void api.styles().then((p) => (palette = p)).catch(() => {});
    void refresh();
    return follow(() => void refresh());
  });
</script>

<svelte:window onkeydown={onKeydown} />

<main>
  <div class="comandi">
    <h2>{tab === 'photo' ? 'Le tue immagini' : 'I tuoi video'}</h2>
    <Button look="primary" onclick={nuovo} disabled={!palette}>
      <Icon name="generate" />{tab === 'video' ? 'Nuovo video' : 'Nuova immagine'}
    </Button>
  </div>
  {#if !jobs}
    <Loader />
  {:else if shown && shown.length === 0}
    <PageCard dashed>
      {#if tab === 'photo'}
        <EmptyState title="Ancora nessuna immagine" line="Premi Nuova immagine e scrivi il prompt: un minuto o due." />
      {:else}
        <EmptyState title="Ancora nessun video" line="Premi Nuovo video e scegli una notizia di oggi: ci vogliono una ventina di minuti." />
      {/if}
    </PageCard>
  {:else}
    <Gallery label={tab === 'photo' ? 'Le tue immagini' : 'I tuoi video'} items={[...tiles, ...pictures]}
      key={(item) => ('url' in item ? `img-${item.id}` : item.id)}>
      {#snippet tile(item)}
        {#if 'url' in item}
          <PhotoTile url={item.url} alt={item.alt} onclick={() => apriFoto(item.id)} />
        {:else}
          <JobTile job={item} onopen={apri} />
        {/if}
      {/snippet}
    </Gallery>
  {/if}
</main>

<TabBar />

{#each ui.modals as request (request)}
  <Modal {request} />
{/each}

{#if ui.sure}<SurePopover />{/if}

<style>
  /* i lavori fatti da bordo a bordo, più per riga quanto più è largo lo schermo */
  /* la galleria da bordo a bordo, come in SendLater: il margine ai lati ce l'hanno solo i comandi e il titolo */
  main {
    display: grid;
    gap: 14px;
    /* in fondo, il posto per la barra delle sezioni */
    padding: max(18px, env(safe-area-inset-top)) 0 var(--sopra-alla-barra);
  }

  main > :global(:not(.grid)) { margin-inline: var(--island-side); }

  .comandi { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }


</style>
