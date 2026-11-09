<script lang="ts">
  import type { Snippet } from 'svelte';
  import { placeAnchored } from '../lib/popover';
  import { portal } from '../lib/portal';
  import { ui } from '../lib/ui.svelte';

  /** Il guscio del foglietto accanto a un tasto: posizione, chiusura (Esc, clic fuori) e vetro. */
  let {
    anchor,
    width,
    height,
    onclose,
    onesc,
    place = 'anchored',
    look = 'list',
    id,
    role,
    label,
    children,
  }: {
    /** Il tasto che l'ha aperto: il foglietto gli sta accanto e non lo chiude. */
    anchor: HTMLElement;
    /** Quanto è largo, e quanto è alto al più: aperto, conta l'altezza che ha davvero. */
    width: number;
    height: number;
    onclose: () => void;
    /** Chiuderlo con Esc, quando deve fare qualcosa in più che chiudersi. */
    onesc?: () => void;
    /**
     * `anchored` sotto al tasto, `drop` il menu a tendina largo quanto il tasto, che resta lì
     * anche sul telefono invece di diventare un foglio dal fondo.
     */
    place?: 'anchored' | 'drop';
    /** `list` un elenco di voci; `dialog` una domanda o un testo, col padding di una scheda. */
    look?: 'list' | 'dialog';
    /** Un nome, per chi deve ritrovarlo da fuori. */
    id?: string;
    /** Quando è una domanda e non un elenco, l'assistenza vocale deve saperlo. */
    role?: string;
    label?: string;
    children: Snippet;
  } = $props();

  /** Segue il suo tasto quando la pagina scorre, e si chiude se il tasto esce di vista. */
  let segue = $state(0);
  /** L'altezza che ha davvero, letta appena è aperto: tre voci non sono i 248px dell'elenco più lungo, e sopra al
      tasto il foglietto starebbe in aria. */
  let pop = $state<HTMLDivElement>();
  let alto = $state(0);
  $effect(() => {
    segue;
    alto = pop!.offsetHeight;
  });
  const at = $derived.by(() => {
    segue;
    return placeAnchored(anchor, width, alto > 0 ? Math.min(height, alto) : height, place === 'drop' ? anchor.getBoundingClientRect().left : undefined);
  });

  /** Sul telefono è un foglio in fondo (la regola in fondo qui), non accanto al tasto: che il tasto scorra via non conta. */
  const foglio = (): boolean => place !== 'drop' && window.matchMedia('(max-width: 600px)').matches;

  $effect(() => {
    const guarda = (): void => {
      const box = anchor.getBoundingClientRect();
      const sparito = !anchor.isConnected || box.bottom < 0 || box.top > window.innerHeight;
      // aprendo la tastiera il telefono fa scorrere la pagina fino al campo: il tasto esce di vista, il foglio resta
      if (sparito && !foglio()) onclose();
      else segue += 1;
    };

    // in cattura, se no gli scorrimenti dentro a un elenco non si sentono
    window.addEventListener('scroll', guarda, true);
    window.addEventListener('resize', guarda);
    return () => {
      window.removeEventListener('scroll', guarda, true);
      window.removeEventListener('resize', guarda);
    };
  });

  // si fa conoscere all'app, che sente Esc: così Esc chiude lui e non la finestra da cui è nato
  $effect(() => ui.sopra(() => (onesc ?? onclose)()));

  /** Un clic fuori chiude, ma non quello sul tasto: chiuderlo due volte lo riaprirebbe. */
  function elsewhere(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-pop]') || anchor.contains(target)) return;
    onclose();
  }
</script>

<!-- Esc non si ascolta qui ma nell'app, che sa cosa c'è aperto: se no chiudeva anche la finestra sotto. -->
<svelte:window onpointerdown={elsewhere} />

<!-- la posizione passa da variabili: `left`/`top` inline vincerebbero sulla regola del telefono -->
<div
  bind:this={pop}
  use:portal
  {id}
  {role}
  data-pop
  class="surface pop"
  class:is-drop={place === 'drop'}
  class:is-dialog={look === 'dialog'}
  aria-label={label}
  style:--pop-x="{at.left}px"
  style:--pop-y="{at.top}px"
  style:--pop-w="{width}px"
  style:--pop-h="{at.max}px"
>
  {@render children()}
</div>

<style>
  .pop {
    position: fixed;
    left: var(--pop-x);
    top: var(--pop-y);
    width: var(--pop-w);
    max-height: var(--pop-h);
    z-index: var(--z-popover);
    padding: 9px;
    /* l'angolo delle voci dentro: quello del foglietto meno il suo padding. Le voci lo leggono da qui,
       perché solo il foglietto sa quanto spazio ha intorno (e sul telefono diventa un foglio) */
    --voce-r: var(--r-pop);
    /* più alto di quello che ha non diventa, e scorre */
    overflow-y: auto;
    animation: rise 0.16s var(--ease);
  }

  /* il menu a tendina copre le righe sotto: pieno, se no si leggono attraverso */
  .pop.is-drop { background: rgb(var(--base)); padding: 6px; --voce-r: var(--r-drop); }

  .pop.is-dialog { padding: var(--card-pad); }

  /* Su un telefono non insegue il suo tasto: si appoggia in fondo, largo quanto lo schermo, dove arriva il pollice. */
  @media (max-width: 600px) {
    .pop:not(.is-drop) {
      left: 0;
      top: auto;
      /* sopra la tastiera, che altrimenti lo copre (lib/tastiera) */
      bottom: var(--tastiera, 0px);
      width: auto;
      right: 0;
      max-height: min(70dvh, 560px);
      border-bottom: 0;
      border-radius: var(--r-lg) var(--r-lg) 0 0;
      padding: var(--card-pad) max(16px, env(safe-area-inset-right)) calc(var(--card-pad) + env(safe-area-inset-bottom))
        max(16px, env(safe-area-inset-left));
      animation: sheet-in-mobile 0.26s var(--ease);
      /* foglio dal basso: il padding è quello di una scheda, e così l'angolo delle voci */
      --voce-r: var(--r-in);
    }
  }
</style>
