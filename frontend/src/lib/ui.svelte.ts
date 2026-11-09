import { tick, type Component } from 'svelte';

/* Quello che si apre davanti alle pagine: la finestra, e la domanda attaccata al tasto che l'ha fatta nascere. Da gymlog. */

/** Una conferma prima di una cosa che non torna indietro. */
export interface SureRequest {
  anchor: HTMLElement;
  /** Cosa succede, detto con il suo nome. */
  title: string;
  /** Cosa si porta dietro: si scrive solo se si porta dietro qualcosa. */
  detail?: string;
  /** Il verbo sul tasto di conferma: "Annulla il messaggio", "Rimuovi". */
  verb: string;
  onYes: () => void;
  /** Il tasto di sinistra. "No" se non lo dici. */
  no?: string;
}

/** Un tasto in fondo a una finestra: lo detta chi ci sta dentro (`tasti()` in `fondo.svelte.ts`). */
export interface ModalAction {
  label: string;
  look?: 'primary' | 'ghost';
  disabled?: boolean;
  /** Torna `false` per lasciarla aperta: quello che hai scritto non va bene, e la finestra lo dice restando lì. */
  onpick: () => boolean | void | Promise<boolean | void>;
}

/** Una finestra davanti a tutto, con dentro un componente: lo stesso che potrebbe stare in una pagina. */
export interface ModalRequest {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: Component<any>;
  props?: Record<string, unknown>;
}

class Ui {
  sure = $state<SureRequest | null>(null);
  /** Le finestre aperte: si vede l'ultima. `raw` perché si cercano per identità. */
  #modals = $state.raw<ModalRequest[]>([]);

  get modals(): ModalRequest[] {
    return this.#modals;
  }

  /** Con una finestra aperta la pagina dietro sta ferma (base.css): sul telefono scorrerebbe sotto il dito. */
  private set modals(list: ModalRequest[]) {
    this.#modals = list;
    document.documentElement.classList.toggle('con-finestra', list.length > 0);
  }

  /** Quella davanti. */
  get modal(): ModalRequest | null {
    return this.modals.at(-1) ?? null;
  }

  /** Quello che si è aperto sopra a tutto e si chiude con Esc, registrato con `sopra()`. */
  #sopra: (() => void)[] = [];
  /** Il guscio di ogni finestra (`Modal.svelte`), e da dove è stata aperta, per tornarci col fuoco. */
  #gusci = new WeakMap<ModalRequest, HTMLElement>();
  #origini = new WeakMap<ModalRequest, Element | null>();
  /** Chi dentro a ogni finestra sa dire se c'è qualcosa di scritto e non salvato: basta un sì. */
  #modifiche = new WeakMap<ModalRequest, Set<() => boolean>>();
  /** Quelle di cui si è già detto «Butta»: la stessa domanda non si rifà. */
  #lasciate = new WeakSet<ModalRequest>();

  /** Si dice che qualcosa si è aperto sopra, con il modo di chiuderlo. Torna come smettere. */
  sopra(chiudi: () => void): () => void {
    this.#sopra.push(chiudi);
    return () => {
      const at = this.#sopra.lastIndexOf(chiudi);
      if (at >= 0) this.#sopra.splice(at, 1);
    };
  }

  /** Chiede conferma accanto al tasto che l'ha chiesta. Un foglietto alla volta. */
  askSure(anchor: HTMLElement, question: Omit<SureRequest, 'anchor'>): void {
    this.sure = { anchor, ...question };
  }

  /** Chiude la domanda senza rispondere, che è quello che fa Esc. */
  lasciaDomanda(): void {
    this.sure = null;
  }

  /** Lo dice il guscio quando si disegna. */
  registra(request: ModalRequest, guscio: HTMLElement): void {
    this.#gusci.set(request, guscio);
  }

  /** Lo dice chi sta dentro, da `modifiche()` in `fondo.svelte.ts`. Torna come smettere. */
  segnaModifiche(request: ModalRequest, quando: () => boolean): () => void {
    const tutte = this.#modifiche.get(request) ?? new Set();
    tutte.add(quando);
    this.#modifiche.set(request, tutte);
    return () => tutte.delete(quando);
  }

  #sporca(request: ModalRequest): boolean {
    return !this.#lasciate.has(request) && [...(this.#modifiche.get(request) ?? [])].some((quando) => quando());
  }

  /** Prima di buttare quello che si stava scrivendo, si chiede accanto alla crocetta; `poi` parte solo con «Butta». */
  #chiediPrima(quali: ModalRequest[], poi: () => void): boolean {
    const sporche = quali.filter((one) => this.#sporca(one));
    const guscio = this.modal ? this.#gusci.get(this.modal) : undefined;
    if (!sporche.length || !guscio) return false;
    this.askSure(guscio.querySelector<HTMLElement>('[data-chiudi]') ?? guscio, {
      title: 'Buttare le modifiche?',
      detail: 'Quello che hai scritto qui non è ancora salvato.',
      verb: 'Butta',
      no: 'Continua a scrivere',
      onYes: () => {
        for (const one of sporche) this.#lasciate.add(one);
        poi();
      },
    });
    return true;
  }

  /** Apre una finestra su un componente, al posto di quella aperta. */
  openModal(request: ModalRequest): void {
    if (this.#chiediPrima(this.modals, () => this.openModal(request))) return;
    this.#origini.set(request, document.activeElement);
    // una domanda aperta parla di quello che adesso finisce coperto
    this.sure = null;
    this.modals = [request];
  }

  /** Chiude quella davanti chiedendo, se c'è da chiedere: la strada della crocetta, di Esc, del dito che la spinge via. */
  lascia(): void {
    if (this.#chiediPrima(this.modals, () => this.closeModal())) return;
    this.closeModal();
  }

  /** Chiude quella che dici, o quella davanti; il fuoco torna al tasto che l'ha aperta. */
  closeModal(which: ModalRequest | undefined = this.modal ?? undefined): void {
    const at = this.modals.findIndex((one) => one === which);
    if (at < 0) return;
    this.modals = this.modals.slice(0, at);
    const guscio = this.#gusci.get(which!);
    if (this.sure && guscio?.contains(this.sure.anchor)) this.sure = null;
    const origine = this.#origini.get(which!);
    void tick().then(() => {
      // nel frattempo se n'è aperta un'altra: il fuoco è suo
      if (this.modal === null && origine instanceof HTMLElement && origine.isConnected) origine.focus();
    });
  }

  /** Tutto quello che sta davanti. */
  closeAll(): void {
    this.sure = null;
    for (const chiudi of this.#sopra.splice(0).reverse()) chiudi();
    this.closeModal(this.modals[0]);
  }

  /** Esc toglie quello che sta davanti, uno strato alla volta. */
  escape(): boolean {
    const ultimo = this.#sopra.pop();
    if (ultimo) return ultimo(), true;
    if (this.sure) return this.lasciaDomanda(), true;
    if (this.modal) return this.lascia(), true;
    return false;
  }
}

export const ui = new Ui();
