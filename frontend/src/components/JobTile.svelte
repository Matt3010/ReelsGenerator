<script lang="ts">
  import { videoUrl, type JobInfo } from '../lib/api';
  import Icon from './Icon.svelte';

  /**
   * Un lavoro in un quadrato della galleria, come una foto in SendLater: fatto, un fotogramma del video; in corso o
   * fallito, solo un segno nell'angolo. Il resto (il passo, l'errore, il copione) sta nella finestra che apre.
   */
  let { job, onopen }: { job: JobInfo; onopen: (job: JobInfo) => void } = $props();

  const nome = $derived(job.title ?? job.topic);
  const detto = $derived(job.state === 'done' ? nome : `${nome} · ${job.state === 'error' ? 'Errore' : job.step}`);
</script>

<button type="button" class="tile" aria-label={detto} title={detto} onclick={() => onopen(job)}>
  {#if job.state === 'done'}
    <!-- un fotogramma a un secondo: il primo è spesso nero -->
    <video src={`${videoUrl(job.id)}#t=1`} muted preload="metadata" playsinline tabindex="-1"></video>
  {:else}
    <span class="segno" aria-hidden="true">
      {#if job.state === 'error'}
        <Icon name="alert" size="sm" tone="danger" bold />
      {:else}
        <span class="ruota"></span>
      {/if}
    </span>
  {/if}
</button>

<style>
  .tile {
    position: relative;
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

  /* nell'angolo in basso, piccolo come i segni sulle foto di SendLater */
  .segno {
    position: absolute;
    left: 6px;
    bottom: 6px;
    display: flex;
    line-height: 0;
  }

  .ruota {
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--hairline);
    border-top-color: var(--ink-2);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .tile:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
