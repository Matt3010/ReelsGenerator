import { tick, type Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ui, type ModalRequest } from './ui.svelte';

/* What stands in front of the pages, without drawing it: the windows, the question by a button, and Esc. */

const window_ = (title: string): ModalRequest => ({ title, view: {} as Component, props: { title } });

/** A shell for a window, as Modal.svelte registers it, with its close button inside. */
function shell(request: ModalRequest): HTMLElement {
  const box = document.createElement('div');
  box.tabIndex = -1;
  const close = document.createElement('button');
  close.dataset.chiudi = '';
  box.append(close);
  document.body.append(box);
  ui.registra(request, box);
  return box;
}

const button = (): HTMLButtonElement => document.body.appendChild(document.createElement('button'));
const ask = (anchor: HTMLElement) => ui.askSure(anchor, { title: 'Sicuro?', verb: 'Sì', onYes: () => undefined });

/** The focus moves once the window is gone from the page. */
const settled = async () => {
  await tick();
  await Promise.resolve();
};

afterEach(() => {
  ui.closeAll();
  document.body.innerHTML = '';
});

describe('a window', () => {
  it('is the one in front once open, and takes the place of the one open before', () => {
    expect(ui.modal).toBeNull();
    const first = window_('Prima');
    const second = window_('Seconda');
    ui.openModal(first);
    expect([ui.modals, ui.modal]).toEqual([[first], first]);
    ui.openModal(second);
    expect([ui.modals, ui.modal]).toEqual([[second], second]);
  });

  it('keeps the page behind it still while it is open: on a phone it would scroll under the finger', () => {
    const still = () => document.documentElement.classList.contains('con-finestra');
    expect(still()).toBe(false);
    const request = window_('A');
    ui.openModal(request);
    expect(still()).toBe(true);
    ui.openModal(window_('B'));
    expect(still()).toBe(true);
    ui.closeModal();
    expect(still()).toBe(false);
  });

  it('closes, and closing it again or one never open does nothing', () => {
    const request = window_('A');
    ui.openModal(request);
    ui.closeModal(request);
    expect(ui.modals).toEqual([]);
    ui.closeModal(request);
    ui.closeModal();
    expect(ui.modals).toEqual([]);
  });

  it('closing one already closed leaves alone the one open now', () => {
    const gone = window_('A');
    ui.openModal(gone);
    ui.closeModal(gone);
    const now = window_('B');
    ui.openModal(now);
    ui.closeModal(gone);
    expect(ui.modals).toEqual([now]);
  });

  it('closing gives the focus back to the button that opened it', async () => {
    const opener = button();
    opener.focus();
    const request = window_('A');
    ui.openModal(request);
    shell(request).focus();
    ui.closeModal();
    await settled();
    expect(document.activeElement).toBe(opener);
  });

  it('closing leaves the focus alone when that button is gone', async () => {
    const opener = button();
    opener.focus();
    const request = window_('A');
    ui.openModal(request);
    const other = button();
    other.focus();
    opener.remove();
    ui.closeModal(request);
    await settled();
    expect(document.activeElement).toBe(other);
  });

  it('closing leaves the focus to a window opened meanwhile', async () => {
    const opener = button();
    opener.focus();
    const first = window_('A');
    ui.openModal(first);
    const elsewhere = button();
    elsewhere.focus();
    ui.closeModal(first);
    ui.openModal(window_('B'));
    await settled();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('closing takes away the question asked from inside it, and leaves the others', () => {
    const request = window_('A');
    ui.openModal(request);
    const box = shell(request);
    const inside = box.appendChild(document.createElement('button'));
    ask(inside);
    ui.closeModal(request);
    expect(ui.sure).toBeNull();

    const next = window_('B');
    ui.openModal(next);
    shell(next);
    const outside = button();
    ask(outside);
    ui.closeModal(next);
    expect(ui.sure?.anchor).toBe(outside);
  });

  it('closing a window not drawn leaves the question alone', () => {
    const request = window_('A');
    ui.openModal(request);
    const outside = button();
    ask(outside);
    ui.closeModal(request);
    expect(ui.sure?.anchor).toBe(outside);
  });

  it('opening takes away the question asked before, which is about what it covers', () => {
    ask(button());
    ui.openModal(window_('A'));
    expect(ui.sure).toBeNull();
  });
});

describe('something not saved in a window', () => {
  it('is asked about before it closes from its cross, Esc or a swipe, and «Butta» closes it', () => {
    const request = window_('A');
    ui.openModal(request);
    const box = shell(request);
    ui.segnaModifiche(request, () => true);
    ui.lascia();
    expect(ui.modals).toEqual([request]);
    expect(ui.sure).toMatchObject({
      title: 'Buttare le modifiche?', detail: 'Quello che hai scritto qui non è ancora salvato.', verb: 'Butta', no: 'Continua a scrivere',
      anchor: box.querySelector('[data-chiudi]'),
    });
    ui.sure!.onYes();
    expect(ui.modals).toEqual([]);
  });

  it('is asked about by the window itself when it has no cross', () => {
    const request = window_('A');
    ui.openModal(request);
    const box = shell(request);
    box.querySelector('[data-chiudi]')!.remove();
    ui.segnaModifiche(request, () => true);
    ui.lascia();
    expect(ui.sure?.anchor).toBe(box);
  });

  it('cannot be asked about with no window drawn, and then it closes', () => {
    const request = window_('A');
    ui.openModal(request);
    ui.segnaModifiche(request, () => true);
    ui.lascia();
    expect(ui.sure).toBeNull();
    expect(ui.modals).toEqual([]);
  });

  it('is not asked about again once thrown away', () => {
    const request = window_('A');
    ui.openModal(request);
    shell(request);
    ui.segnaModifiche(request, () => true);
    ui.lascia();
    ui.sure!.onYes();
    ui.openModal(request);
    ui.lascia();
    expect(ui.sure).toBeNull();
    expect(ui.modals).toEqual([]);
  });

  it('is nothing when every field says nothing changed, or stopped counting', () => {
    const request = window_('A');
    ui.openModal(request);
    shell(request);
    ui.segnaModifiche(request, () => false);
    const stop = ui.segnaModifiche(request, () => true);
    stop();
    ui.lascia();
    expect(ui.sure).toBeNull();
    expect(ui.modals).toEqual([]);
  });

  it('is asked about once a single field says so', () => {
    const request = window_('A');
    ui.openModal(request);
    shell(request);
    ui.segnaModifiche(request, () => false);
    ui.segnaModifiche(request, () => true);
    ui.lascia();
    expect(ui.sure?.verb).toBe('Butta');
  });

  it('is asked about before another window takes its place', () => {
    const request = window_('A');
    ui.openModal(request);
    shell(request);
    ui.segnaModifiche(request, () => true);
    const next = window_('B');
    ui.openModal(next);
    expect(ui.modals).toEqual([request]);
    ui.sure!.onYes();
    expect(ui.modals).toEqual([next]);
  });

  it('is nothing to ask with no window open', () => {
    ui.lascia();
    expect([ui.sure, ui.modals]).toEqual([null, []]);
  });
});

describe('everything in front', () => {
  it('goes when the page changes', () => {
    const chiudi = vi.fn();
    ui.sopra(chiudi);
    ask(button());
    const request = window_('A');
    ui.openModal(request);
    ui.segnaModifiche(request, () => true);
    ui.closeAll();
    expect([ui.modals, ui.sure]).toEqual([[], null]);
    expect(chiudi).toHaveBeenCalledOnce();
    ui.closeAll();
    expect(chiudi).toHaveBeenCalledOnce();
  });

  it('goes from the top when the page changes', () => {
    const order: string[] = [];
    ui.sopra(() => order.push('menu'));
    ui.sopra(() => order.push('elenco'));
    ui.closeAll();
    expect(order).toEqual(['elenco', 'menu']);
  });

  it('goes one layer at a time with Esc, the last opened over all first', () => {
    const order: string[] = [];
    const request = window_('A');
    ui.openModal(request);
    ask(button());
    ui.sopra(() => order.push('menu'));
    ui.sopra(() => order.push('elenco'));
    expect(ui.escape()).toBe(true);
    expect(ui.escape()).toBe(true);
    expect(order).toEqual(['elenco', 'menu']);
    expect(ui.sure).not.toBeNull();
    expect(ui.escape()).toBe(true);
    expect(ui.sure).toBeNull();
    expect(ui.escape()).toBe(true);
    expect(ui.modals).toEqual([]);
    expect(ui.escape()).toBe(false);
  });

  it('forgets what floated over once it closed by itself, even twice', () => {
    const chiudi = vi.fn();
    const other = vi.fn();
    ui.sopra(other);
    const smetti = ui.sopra(chiudi);
    smetti();
    smetti();
    expect(ui.escape()).toBe(true);
    expect(chiudi).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledOnce();
  });

  it('forgets the first that floated over, too', () => {
    const smetti = ui.sopra(vi.fn());
    smetti();
    expect(ui.escape()).toBe(false);
  });

  it('forgets only its own place in the queue, the same closing registered twice', () => {
    const chiudi = vi.fn();
    const later = vi.fn();
    ui.sopra(chiudi);
    ui.sopra(later);
    const smetti = ui.sopra(chiudi);
    smetti();
    ui.escape();
    expect(later).toHaveBeenCalledOnce();
    expect(chiudi).not.toHaveBeenCalled();
  });

  it('a question asked replaces the one before, and says No if not told', () => {
    const anchor = button();
    ui.askSure(anchor, { title: 'Prima?', verb: 'Sì', onYes: () => undefined });
    ui.askSure(anchor, { title: 'Seconda?', verb: 'Sì', onYes: () => undefined, detail: 'Dettaglio' });
    expect(ui.sure).toMatchObject({ anchor, title: 'Seconda?', detail: 'Dettaglio' });
    ui.lasciaDomanda();
    expect(ui.sure).toBeNull();
  });
});
