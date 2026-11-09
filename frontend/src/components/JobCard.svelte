<script lang="ts">
  import type { ImageModel, JobInfo, Story } from '../lib/api';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Loader from './Loader.svelte';
  import PhotoProperties from './PhotoProperties.svelte';
  import { durata } from '../lib/tempo';
  import { ui } from '../lib/ui.svelte';

  /** Un video: mentre si fa, il passo a cui è; fatto, il video da guardare e scaricare; andato male, il perché. */
  let {
    job,
    onRetry,
    onDelete,
    loadStory,
    models = [],
  }: {
    job: JobInfo;
    onRetry: (id: string) => void;
    onDelete: (id: string) => void;
    loadStory: (id: string) => Promise<Story>;
    /** per dire il nome del modello delle immagini */
    models?: ImageModel[];
  } = $props();

  let copione = $state<string[] | null>(null);

  // l'ora di adesso, ogni secondo, solo mentre lavora (come in SendLater)
  let adesso = $state(Date.now() / 1000);
  $effect(() => {
    if (job.state !== 'running') return;
    adesso = Date.now() / 1000;
    const tick = setInterval(() => (adesso = Date.now() / 1000), 1000);
    return () => clearInterval(tick);
  });
  /** da quanto lavora, o quanto ci ha messo */
  const trascorso = $derived(job.started === undefined ? null : (job.finished ?? adesso) - job.started);

  /** si chiede accanto al tasto, come in SendLater: è una cosa che non torna indietro */
  function elimina(event: MouseEvent) {
    ui.askSure(event.currentTarget as HTMLElement, {
      title: job.kind === 'photo' ? 'Eliminare queste immagini?' : 'Eliminare il video?',
      detail: 'Si cancella per sempre.',
      verb: 'Elimina',
      onYes: () => onDelete(job.id),
    });
  }

  async function apriCopione() {
    if (copione) { copione = null; return; }
    const story = await loadStory(job.id);
    copione = story.scenes.map((s) => s.narration);
  }
</script>

<article class="job">
  {#if job.state === 'done'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video src={job.video?.url} controls preload="metadata" playsinline></video>
  {:else if job.state !== 'error'}
    <!-- fallito, basta l'avviso qui sotto con Riprova -->
    <div class="attesa">
      <Loader delay={0} />
      <p>{job.step}</p>
      <!-- sotto, il modello e il tempo: le cifre larghe uguali, così il secondo che scorre non sposta niente -->
      {#if job.state === 'running' && (job.detail || trascorso !== null)}
        <p class="dettaglio">{[job.detail, trascorso !== null ? durata(trascorso) : null].filter(Boolean).join(' · ')}</p>
      {/if}
    </div>
  {/if}

  <div class="meta">
    {#if job.kind === 'photo' && job.photo}
      <PhotoProperties photo={job.photo} {models} took={job.finished ? trascorso ?? undefined : undefined} />
    {:else}
      <!-- la modale ha già il titolo (o l'argomento, finché il titolo non c'è): qui solo quel che manca -->
      <p class="sotto">{[
        job.news?.outlet,
        job.title && job.title !== job.topic ? job.topic : null,
        job.duration ? `${Math.round(job.duration)} s` : null,
        job.state === 'done' && trascorso !== null ? `fatto in ${durata(trascorso)}` : null,
      ].filter(Boolean).join(' · ')}</p>
    {/if}

    {#if job.state === 'error' && job.error}
      <Alert message={job.error} action={{ label: 'Riprova', run: () => onRetry(job.id) }} />
    {/if}

    {#if job.state === 'done' || job.state === 'error'}
      <div class="azioni">
        {#if job.state === 'done'}
          <Button look="ghost" size="sm" href={job.video?.download} download><Icon name="download" />Scarica</Button>
          <Button look="ghost" size="sm" onclick={apriCopione}><Icon name="script" />Copione</Button>
        {/if}
        <span class="spazio"></span>
        <Button look="ghost" size="sm" tone="danger" onclick={elimina}><Icon name="trash" />Elimina</Button>
      </div>
    {/if}

    {#if copione}
      <ol class="copione">
        {#each copione as riga, i (i)}<li>{riga}</li>{/each}
      </ol>
    {/if}
  </div>
</article>

<style>
  .job { display: flex; flex-direction: column; gap: 4px; }

  video {
    width: 100%;
    aspect-ratio: 9 / 16;
    background: #000;
    border-radius: var(--r-in);
  }

  .attesa {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 8px;
    padding: 28px 16px;
    border-radius: var(--r-in);
    background: var(--sunken);
    color: var(--ink-2);
    text-align: center;
    font-size: 13px;
  }

  .attesa p { margin: 0; }
  .dettaglio { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }

  .meta { display: grid; gap: 8px; padding: 8px 0 0; }

  .sotto { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0; font-size: 12.5px; color: var(--ink-3); }

  .azioni { display: flex; gap: 6px; }
  .spazio { flex: 1; }

  .copione { margin: 0; padding: 10px 10px 10px 28px; border-radius: var(--r-in); background: var(--sunken); font-size: 12.5px; color: var(--ink-2); }
</style>
