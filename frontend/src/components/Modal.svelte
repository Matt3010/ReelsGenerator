<script lang="ts">
  import { tick } from 'svelte';
  import { offriIlFondo } from '../lib/fondo.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui, type ModalAction, type ModalRequest } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * La finestra davanti a tutto, da gymlog: un guscio con il titolo e la chiusura, il componente che chi la apre le passa, e i tasti in fondo.
   * Su uno schermo grande si apre in alto a destra, su un telefono prende lo schermo (la scatola `.modal` in base.css).
   */
  let { request }: { request: ModalRequest } = $props();

  /** I tasti in fondo, che detta chi sta dentro. */
  let dettati = $state<(() => ModalAction[]) | null>(null);
  const azioni = $derived(dettati ? dettati() : []);

  let guscio = $state<HTMLElement>();
  $effect(() => {
    if (guscio) ui.registra(request, guscio);
  });
  offriIlFondo({
    detta: (fondo) => (dettati = fondo),
    modifiche: (quando) => ui.segnaModifiche(request, quando),
  });

  // il fuoco entra quando si apre: se chi sta dentro non l'ha già preso, sulla finestra, e da lì Tab parte dal primo tasto
  $effect(() => {
    const qui = guscio;
    if (!qui) return;
    void tick().then(() => {
      if (!qui.contains(document.activeElement)) qui.focus({ preventScroll: true });
    });
  });

  /** Quello su cui Tab si ferma. */
  const TAPPE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** E resta dentro: dall'ultimo tasto Tab torna al primo, e al contrario. Un foglietto aperto da qui sta fuori, ed è suo. */
  function trattieni(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !guscio) return;
    const attivo = document.activeElement;
    if (attivo instanceof Element && attivo.closest('[data-pop]')) return;
    const tappe = [...guscio.querySelectorAll<HTMLElement>(TAPPE)];
    const fuori = !(attivo instanceof Node) || !guscio.contains(attivo);
    if (event.shiftKey && (fuori || attivo === tappe[0] || attivo === guscio)) {
      event.preventDefault();
      tappe.at(-1)?.focus();
    } else if (!event.shiftKey && (fuori || attivo === tappe.at(-1))) {
      event.preventDefault();
      tappe[0]?.focus();
    }
  }

  /** Un tasto chiude, a meno che non dica `false`: quello che hai scritto non va bene, e lo si dice restando qui. */
  async function press(azione: ModalAction): Promise<void> {
    if ((await azione.onpick()) !== false) ui.closeModal(request);
  }
</script>

<svelte:window onkeydown={trattieni} />

<!-- dietro: un tocco qui chiude, chiedendo se c'è del non salvato; Esc lo sente l'app (ui.escape) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => ui.lascia()}></div>

<div
  class="surface modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
  bind:this={guscio}
  use:swipeToClose={() => ui.lascia()}
>
  <header>
    <h2 id="modal-title">{request.title}</h2>
    <!-- la domanda sul non salvato si attacca a questo tasto (`data-chiudi`) -->
    <Button look="icon" title="Chiudi" aria-label="Chiudi" data-chiudi onclick={() => ui.lascia()}>
      <Icon name="close" />
    </Button>
  </header>

  <div class="modal-body">
    <request.view {...request.props ?? {}} />
  </div>

  {#if azioni.length}
    <div class="modal-foot">
      {#each azioni as azione (azione.label)}
        <Button look={azione.look ?? 'ghost'} disabled={azione.disabled} onclick={() => void press(azione)}>{azione.label}</Button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* dove sta e quanto è larga lo dice `.modal` in base.css; qui tre fasce, e scorre solo quella di mezzo */
  .modal {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .modal:focus { outline: none; }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    background: rgb(0 0 0 / 0.18);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex: none;
  }

  h2 { color: var(--ink); }

  .modal-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 14px;
    /* l'aria per le ombre dei campi, che chi scorre taglierebbe */
    margin: -6px;
    padding: 6px;
  }

  .modal-foot {
    flex: none;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline-soft);
  }

  /* sul telefono i tasti in fondo si allargano, per il pollice */
</style>
