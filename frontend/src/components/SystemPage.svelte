<script lang="ts">
  import type { Stats } from '../lib/api';
  import Loader from './Loader.svelte';
  import PageCard from './PageCard.svelte';
  import ProgressBar from './ProgressBar.svelte';

  /**
   * Quanto lavora la macchina, come htop: la GPU, e CPU, memoria e processi della macchina Linux di Docker (dove
   * girano sd.cpp e llama.cpp). Il server manda un campione ogni due secondi finché la pagina è aperta.
   */
  let stats = $state<Stats | null>(null);

  $effect(() => {
    const source = new EventSource('/api/stats');
    source.addEventListener('message', (e) => { stats = JSON.parse((e as MessageEvent<string>).data); });
    return () => source.close();
  });

  const gb = (mib: number) => (mib / 1024).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /** sotto il giga in MB, sopra in GB */
  const size = (mib: number) => (mib < 1024 ? `${Math.round(mib)} MB` : `${gb(mib)} GB`);
</script>

<h2>Sistema</h2>

{#if !stats}
  <Loader />
{:else}
  <div class="schede">
    <PageCard label="GPU">
      <p class="titolo">GPU</p>
      {#if stats.gpu}
        <p class="nome">{stats.gpu.name}</p>
        <div class="misura"><span>Uso</span><b>{stats.gpu.util}%</b></div>
        <ProgressBar value={stats.gpu.util} max={100} label="GPU" />
        <div class="misura"><span>Memoria video</span><b>{gb(stats.gpu.memUsed)} / {gb(stats.gpu.memTotal)} GB</b></div>
        <ProgressBar value={stats.gpu.memUsed} max={stats.gpu.memTotal} label="Memoria video" />
        <p class="nota">{Math.round(stats.gpu.temp)} °C · {Math.round(stats.gpu.power)} W</p>
      {:else}
        <p class="nota">Nessuna GPU vista da Docker.</p>
      {/if}
    </PageCard>

    <PageCard label="CPU e memoria">
      <p class="titolo">CPU e memoria</p>
      <div class="misura"><span>CPU · {stats.cores} core</span><b>{stats.cpu}%</b></div>
      <ProgressBar value={stats.cpu} max={100} label="CPU" />
      <div class="misura"><span>Memoria</span><b>{gb(stats.mem.used)} / {gb(stats.mem.total)} GB</b></div>
      <ProgressBar value={stats.mem.used} max={stats.mem.total} label="Memoria" />
      <p class="nota">Della macchina Linux di Docker, non di tutto Windows.</p>
    </PageCard>

    <PageCard label="Processi" wide>
      <p class="titolo">Processi</p>
      <table>
        <thead><tr><th>Processo</th><th class="end">CPU</th><th class="end">Memoria</th></tr></thead>
        <tbody>
          {#each stats.procs as p (p.pid)}
            <tr><td>{p.name}</td><td class="end">{p.cpu}%</td><td class="end">{size(p.mem)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="nota">100% = un core pieno: sd.cpp e llama.cpp ne usano diversi.</p>
    </PageCard>
  </div>
{/if}

<style>
  h2 { margin: 0 0 12px; font-size: 18px; }

  .schede { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }

  .titolo { margin: 0; font-weight: 600; }
  .nome { margin: 0; font-size: 12.5px; color: var(--ink-3); }
  .nota { margin: 0; font-size: 12px; color: var(--ink-3); }

  .misura { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--ink-2); }
  .misura b, td.end { font-variant-numeric: tabular-nums; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 500; color: var(--ink-3); padding: 0 0 6px; }
  td { padding: 5px 0; border-top: 1px solid var(--hairline); color: var(--ink-2); }
  .end { text-align: right; }
</style>
