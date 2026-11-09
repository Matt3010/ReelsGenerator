<script lang="ts">
  import { videoUrl, type JobInfo } from '../lib/api';
  import Icon from './Icon.svelte';
  import Loader from './Loader.svelte';

  /**
   * Un lavoro in un quadrato della galleria, come una foto: fatto, un fotogramma del video; in corso, il passo a cui è;
   * fallito, il segno. Il titolo è il suo nome (si legge nella finestra che apre).
   */
  let { job, onopen }: { job: JobInfo; onopen: (job: JobInfo) => void } = $props();
</script>

<button type="button" class="tile" aria-label={job.title ?? job.topic} onclick={() => onopen(job)}>
  {#if job.state === 'done'}
    <!-- un fotogramma a un secondo: il primo è spesso nero -->
    <video src={`${videoUrl(job.id)}#t=1`} muted preload="metadata" playsinline tabindex="-1"></video>
  {:else}
    <span class="attesa">
      {#if job.state === 'error'}
        <Icon name="alert" size="lg" tone="danger" />
        <span>Errore</span>
      {:else}
        <Loader delay={0} />
        <span>{job.step}</span>
      {/if}
    </span>
  {/if}
</button>

<style>
  .tile {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: 0;
    background: var(--sunken);
    color: inherit;
    cursor: pointer;
    overflow: hidden;
  }

  video { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

  .attesa {
    display: grid;
    height: 100%;
    align-content: center;
    justify-items: center;
    gap: 4px;
    padding: 8px;
    color: var(--ink-2);
    font-size: 11.5px;
    text-align: center;
  }

  .attesa :global(.loader) { padding: 0; }

  .tile:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
