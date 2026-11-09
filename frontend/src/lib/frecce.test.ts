import { afterEach, describe, expect, it } from 'vitest';
import { frecce } from './frecce';

/** A list of buttons, the one pressed said so. */
function list(pressed: number | null, count = 4): HTMLElement {
  const box = document.createElement('div');
  for (let at = 0; at < count; at++) {
    const button = document.createElement('button');
    button.textContent = `voce ${at}`;
    if (pressed !== null) button.setAttribute('aria-pressed', String(at === pressed));
    box.append(button);
  }
  document.body.append(box);
  return box;
}

const key = (box: HTMLElement, name: string) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  (document.activeElement ?? box).dispatchEvent(event);
  return event;
};
const focused = () => document.activeElement?.textContent;

afterEach(() => (document.body.innerHTML = ''));

describe('the keys on a list of choices', () => {
  it('start on the one chosen, or the first, once it is where it is shown', async () => {
    frecce(list(2));
    await Promise.resolve();
    expect(focused()).toBe('voce 2');
    document.body.innerHTML = '';
    frecce(list(null));
    await Promise.resolve();
    expect(focused()).toBe('voce 0');
  });

  it('move with the arrows, Home and End, never past the ends, and keep the page from scrolling', async () => {
    const box = list(1);
    frecce(box);
    await Promise.resolve();
    expect(key(box, 'ArrowDown').defaultPrevented).toBe(true);
    expect(focused()).toBe('voce 2');
    key(box, 'ArrowDown');
    key(box, 'ArrowDown');
    expect(focused()).toBe('voce 3');
    key(box, 'ArrowUp');
    expect(focused()).toBe('voce 2');
    key(box, 'Home');
    expect(focused()).toBe('voce 0');
    key(box, 'ArrowUp');
    expect(focused()).toBe('voce 0');
    key(box, 'End');
    expect(focused()).toBe('voce 3');
    // any other key is the page's
    expect(key(box, 'a').defaultPrevented).toBe(false);
    expect(focused()).toBe('voce 3');
  });

  it('leave the cursor where it is for a second list beside the first (the minutes beside the hours)', async () => {
    frecce(list(1));
    frecce(list(3), { prende: false });
    await Promise.resolve();
    expect(focused()).toBe('voce 1');
  });

  it('let go of the list when it is gone', async () => {
    const box = list(0);
    const action = frecce(box);
    await Promise.resolve();
    action.destroy();
    key(box, 'ArrowDown');
    expect(focused()).toBe('voce 0');
  });
});
