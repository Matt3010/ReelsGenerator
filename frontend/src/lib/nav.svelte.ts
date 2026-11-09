import { canonical, readRoute } from './routing';

/**
 * Dove siamo, e come ci si sposta senza ricaricare (quello di SendLater, senza i suoi messaggi in fondo): un ascolto
 * sui clic dei link (ctrl/cmd/tasto centrale restano del browser) e sul tasto indietro.
 */
class Nav {
  path = $state(window.location.pathname);

  route = $derived(readRoute(this.path));

  constructor() {
    // un indirizzo scritto in un altro modo si apre lo stesso, ma nella barra ci va quello buono
    const buono = canonical(this.path);
    if (buono !== this.path) {
      history.replaceState({}, '', buono);
      this.path = buono;
    }
    // anche il tasto indietro (e la strisciata indietro dell'iPhone)
    window.addEventListener('popstate', () => {
      this.path = window.location.pathname;
    });
    document.addEventListener('click', (event) => this.#maybe(event));
  }

  /** `replace` non lascia un passo indietro. */
  go(path: string, { replace = false } = {}): void {
    const dove = canonical(path);
    if (dove === this.path) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', dove);
    this.path = dove;
    // una pagina nuova si legge dall'alto, non da dove stava l'altra
    window.scrollTo({ top: 0 });
  }

  #maybe(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // a click always has a target; plain text has no `closest`
    const link = (event.target as Partial<Element>).closest?.('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    // the API (a video, a picture to download) is not a page of the app
    if (url.pathname.startsWith('/api/')) return;

    event.preventDefault();
    this.go(url.pathname);
  }
}

export const nav = new Nav();
