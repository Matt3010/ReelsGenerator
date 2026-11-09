<script lang="ts">
  import { imageUrl, videoUrl, type JobInfo, type Story } from '../lib/api';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Loader from './Loader.svelte';
  import ProgressBar from './ProgressBar.svelte';

  /** Un video: mentre si fa, il passo a cui è; fatto, il video da guardare e scaricare; andato male, il perché. */
  let {
    job,
    onRetry,
    loadStory,
  }: {
    job: JobInfo;
    onRetry: (id: string) => void;
    loadStory: (id: string) => Promise<Story>;
  } = $props();

  // «Disegno l'immagine 3/8» -> 3 di 8: la barra lo mostra
  const passo = $derived.by(() => {
    const m = /(\d+)\/(\d+)/.exec(job.step);
    return m ? { value: Number(m[1]), max: Number(m[2]) } : null;
  });

  let copione = $state<string[] | null>(null);

  async function apriCopione() {
    if (copione) { copione = null; return; }
    const story = await loadStory(job.id);
    copione = story.scenes.map((s) => s.narration);
  }
</script>

<article class="job">
  {#if job.state === 'done' && job.kind === 'photo'}
    <div class="foto">
      {#each job.images ?? [] as id, i (id)}
        <a href={imageUrl(id)} target="_blank" rel="noreferrer" aria-label={`Apri immagine ${i + 1}`}>
          <img src={imageUrl(id)} alt={job.topic} loading="lazy" />
        </a>
      {/each}
    </div>
  {:else if job.state === 'done'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video src={videoUrl(job.id)} controls preload="metadata" playsinline></video>
  {:else}
    <div class="attesa">
      {#if job.state === 'error'}
        <Icon name="alert" size="lg" tone="danger" />
      {:else}
        <Loader delay={0} />
      {/if}
      <p>{job.step}</p>
      {#if passo && job.state === 'running'}
        <ProgressBar value={passo.value} max={passo.max} label="Avanzamento" />
      {/if}
    </div>
  {/if}

  <div class="meta">
    <p class="sotto">
      {#if job.news}<Icon name="news" size="sm" tone="muted" /> {job.news.outlet} · {/if}{job.topic}
      {#if job.duration}· {Math.round(job.duration)} s{/if}
    </p>

    {#if job.state === 'error' && job.error}
      <Alert message={job.error} action={{ label: 'Riprova', run: () => onRetry(job.id) }} />
    {/if}

    {#if job.state === 'done' && job.kind !== 'photo'}
      <div class="azioni">
        <Button look="ghost" size="sm" href={videoUrl(job.id)} download><Icon name="download" />Scarica</Button>
        <Button look="ghost" size="sm" onclick={apriCopione}><Icon name="script" />Copione</Button>
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

  video, .attesa {
    width: 100%;
    aspect-ratio: 9 / 16;
    background: #000;
    border-radius: var(--r-in);
  }

  .attesa {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 10px;
    padding: 24px;
    background: var(--sunken);
    color: var(--ink-2);
    text-align: center;
    font-size: 13px;
  }

  .attesa p { margin: 0; }
  .attesa :global(.bar) { width: 70%; }

  .foto {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    background: #000;
    border-radius: var(--r-in);
    overflow: hidden;
  }
  .foto img { display: block; width: 100%; aspect-ratio: 9 / 16; object-fit: cover; }

  .meta { display: grid; gap: 8px; padding: 8px 0 0; }

  .sotto { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0; font-size: 12.5px; color: var(--ink-3); }

  .azioni { display: flex; gap: 6px; }

  .copione { margin: 0; padding: 10px 10px 10px 28px; border-radius: var(--r-in); background: var(--sunken); font-size: 12.5px; color: var(--ink-2); }
</style>
