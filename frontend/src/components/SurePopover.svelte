<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Popover from './Popover.svelte';

  /** La domanda di conferma accanto al tasto, prima di una cosa che non torna indietro. */
  const request = $derived(ui.sure!);

  function yes() {
    const run = request.onYes;
    ui.sure = null;
    run();
  }
</script>

<Popover
  anchor={request.anchor}
  width={264}
  height={request.detail ? 132 : 108}
  id="sure-popover"
  look="dialog"
  role="alertdialog"
  label={request.title}
  onclose={() => (ui.sure = null)}
  onesc={() => ui.lasciaDomanda()}
>
  <p class="sure-what">{request.title}</p>
  {#if request.detail}<p class="sure-detail">{request.detail}</p>{/if}
  <div class="sure-acts">
    <Button look="ghost" size="sm" onclick={() => (ui.sure = null)}>{request.no ?? 'No'}</Button>
    <Button look="danger-solid" size="sm" onclick={yes}>{request.verb}</Button>
  </div>
</Popover>

<style>
  /* il vetro, la posizione e l'entrata li mette il foglietto */
  .sure-what {
    margin: 0;
    font-size: 13.5px;
    font-weight: 560;
    letter-spacing: -0.012em;
    color: var(--ink);
  }

  .sure-detail {
    margin: 5px 0 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .sure-acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }


  /* sul telefono il no e il sì metà per uno, larghi come il foglio */
</style>
