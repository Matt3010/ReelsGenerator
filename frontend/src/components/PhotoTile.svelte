<script lang="ts">
  /**
   * Una foto in un quadrato 1:1, ritagliata per riempirlo. Si carica solo quando arriva sullo schermo, e fino ad
   * allora il quadrato pulsa. Con `onclick` si apre (un tasto); senza, è solo da guardare.
   * (Quello di SendLater, senza i segni dei messaggi negli angoli.)
   */
  let {
    url,
    alt,
    dim = false,
    onclick,
  }: {
    url: string;
    alt: string;
    /** Ancora in caricamento: si vede, sbiadita. */
    dim?: boolean;
    onclick?: () => void;
  } = $props();

  /** I suoi byte sono arrivati (o non arriveranno: allora si vede che manca, senza pulsare per sempre). */
  let loaded = $state(false);
  const done = () => (loaded = true);
  /** Arrivata non vuol dire disegnata: dalla cache arriva subito, ma una foto grande si decodifica ancora un po'. */
  function arrived(event: Event): void {
    const img = event.currentTarget as HTMLImageElement;
    if (img.decode) img.decode().then(done, done);
    else done();
  }
</script>

{#if onclick}
  <button type="button" class="tile" class:is-dim={dim} class:is-loading={!loaded} aria-label={alt} {onclick}>
    <img src={url} alt="" loading="lazy" decoding="async" onload={arrived} onerror={done} />
  </button>
{:else}
  <img class="tile" class:is-dim={dim} class:is-loading={!loaded} src={url} {alt} loading="lazy" decoding="async" onload={arrived} onerror={done} />
{/if}

<style>
  .tile {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: 0;
    background: var(--sunken);
    object-fit: cover;
    cursor: default;
  }

  button.tile { cursor: pointer; }

  .tile img { display: block; width: 100%; height: 100%; object-fit: cover; }

  .tile.is-dim { opacity: 0.5; }

  /* in arrivo: il quadrato c'è già, e pulsa piano */
  .tile.is-loading { animation: arriving 1.2s ease-in-out infinite alternate; }

  @keyframes arriving {
    from { opacity: 1; }
    to { opacity: 0.55; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile.is-loading { animation: none; }
  }

  button.tile:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
