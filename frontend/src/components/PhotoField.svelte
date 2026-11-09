<script lang="ts">
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PhotoTile from './PhotoTile.svelte';

  /**
   * Una foto dal dispositivo (quella di SendLater): si sceglie, si vede subito, e intanto va su silo (il browser la
   * carica da sé, con il modulo che l'API firma). `onpick` la dà quando è arrivata, null quando la si toglie.
   */
  let {
    label,
    picked,
    upload,
    onpick,
  }: {
    /** cosa è, per chi non la vede */
    label: string;
    /** quella scelta adesso: la sua chiave in silo e come si vede */
    picked: { key: string; url: string } | null;
    /** la manda a silo e ne torna la chiave */
    upload: (file: File) => Promise<string>;
    onpick: (photo: { key: string; url: string } | null) => void;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);
  /** Il file scelto, mentre va su: si vede già, sbiadito. */
  let uploading = $state<string | null>(null);
  let error = $state('');

  async function choose(event: Event): Promise<void> {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    const preview = URL.createObjectURL(file);
    uploading = preview;
    try {
      onpick({ key: await upload(file), url: preview });
    } catch (failure) {
      URL.revokeObjectURL(preview);
      error = (failure as Error).message;
    } finally {
      uploading = null;
      // la stessa foto, scelta di nuovo, è un'altra scelta
      input!.value = '';
    }
  }
</script>

<div class="photo">
  {#if uploading !== null || picked !== null}
    <div class="shown">
      <PhotoTile url={uploading ?? picked!.url} alt={label} dim={uploading !== null} />
      {#if uploading === null}
        <span class="away">
          <Button look="icon" title="Togli la foto" aria-label="Togli la foto" onclick={() => onpick(null)}><Icon name="close" /></Button>
        </span>
      {/if}
    </div>
  {:else}
    <Button look="ghost" size="sm" onclick={() => input!.click()}><Icon name="photo" />Scegli una foto</Button>
  {/if}
  <input bind:this={input} class="file" type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} onchange={choose} />
  {#if error}<Alert message={error} />{/if}
</div>

<style>
  .photo { display: grid; gap: 8px; justify-items: start; }

  /* un quadrato piccolo: si vede che c'è, e cos'è */
  .shown { position: relative; width: 96px; border-radius: var(--r-in); overflow: hidden; }

  .away { position: absolute; top: 4px; right: 4px; }

  /* il file si sceglie dal tasto qui sopra: il campo vero non si vede */
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
