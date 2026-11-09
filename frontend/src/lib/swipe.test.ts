import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { swipeToClose } from './swipe';

/* A sheet pushed down with a finger on a phone: far enough it closes, not enough it goes back. */

let phone = true;
let sheet: HTMLElement;
let onClose: ReturnType<typeof vi.fn>;
let action: { destroy(): void };

const pointer = (type: string, clientY: number, change: Partial<PointerEventInit> = {}, target: Element = sheet) =>
  target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientY, button: 0, ...change }), { pointerId: 1 }));

beforeEach(() => {
  phone = true;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: phone && query === '(max-width: 600px)' }) as MediaQueryList);
  vi.useFakeTimers();
  const page = document.body.appendChild(document.createElement('div'));
  sheet = page.appendChild(document.createElement('div'));
  sheet.setPointerCapture = vi.fn();
  onClose = vi.fn();
  action = swipeToClose(sheet, onClose);
});

afterEach(() => {
  action.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a sheet on a phone', () => {
  it('follows the finger down, never up, and holds it once it moved', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 50);
    expect(sheet.style.transform).toBe('translateY(0px)');
    pointer('pointermove', 104);
    expect(sheet.setPointerCapture).not.toHaveBeenCalled();
    pointer('pointermove', 140);
    expect(sheet.style.transform).toBe('translateY(40px)');
    expect(sheet.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('closes when pushed far enough', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 191);
    pointer('pointerup', 191);
    expect(onClose).toHaveBeenCalledOnce();
    expect([sheet.style.transform, sheet.style.transition]).toEqual(['', '']);
  });

  it('goes back in place, smoothly, when not pushed far enough', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 190);
    pointer('pointerup', 190);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.transition).toBe('transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)');
    vi.advanceTimersByTime(239);
    expect(sheet.style.transition).not.toBe('');
    vi.advanceTimersByTime(1);
    expect(sheet.style.transition).toBe('');

    // a cancelled gesture ends like a lifted finger
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointercancel', 300);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closing is not smooth, even right after going back in place', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 150);
    pointer('pointerup', 150);
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(sheet.style.transition).toBe('');
  });

  it('closing leaves no timer behind that cuts short the next going back in place', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    vi.advanceTimersByTime(100);
    pointer('pointerdown', 100);
    pointer('pointerup', 150);
    vi.advanceTimersByTime(140);
    // the close set no timer of its own, which would cut this one short
    expect(sheet.style.transition).not.toBe('');
  });

  it('is done with the gesture once the finger is lifted', () => {
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    pointer('pointermove', 200);
    expect(sheet.style.transform).toBe('');
    pointer('pointerup', 200);
    expect(onClose).toHaveBeenCalledOnce();
    expect(sheet.style.transition).toBe('');
  });

  it('is dragged however the page behind is scrolled', () => {
    sheet.parentElement!.scrollTop = 10;
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('still finishes the gesture when the pointer is gone', () => {
    sheet.setPointerCapture = () => {
      throw new Error('gone');
    };
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is not dragged from a control, nor from something scrolled down, nor with another button', () => {
    for (const tag of ['input', 'textarea', 'select', 'button', 'a']) {
      const control = sheet.appendChild(document.createElement(tag));
      pointer('pointerdown', 100, {}, control);
      pointer('pointermove', 300);
      pointer('pointerup', 300);
    }
    const body = sheet.appendChild(document.createElement('div'));
    const line = body.appendChild(document.createElement('p'));
    body.scrollTop = 10;
    pointer('pointerdown', 100, {}, line);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    sheet.scrollTop = 10;
    pointer('pointerdown', 100);
    pointer('pointerup', 300);
    sheet.scrollTop = 0;
    pointer('pointerdown', 100, { button: 2 });
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('is dragged from what is not scrolled, inside it', () => {
    const line = sheet.appendChild(document.createElement('p'));
    pointer('pointerdown', 100, {}, line);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does nothing on a wide screen, nor without a gesture started, nor once destroyed', () => {
    pointer('pointermove', 300);
    expect(sheet.style.transform).toBe('');
    pointer('pointerup', 300);
    phone = false;
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    expect(sheet.style.transform).toBe('');
    phone = true;
    action.destroy();
    pointer('pointerdown', 100);
    pointer('pointermove', 300);
    pointer('pointerup', 300);
    pointer('pointercancel', 300);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('stops listening to every event it listened to', () => {
    const other = document.body.appendChild(document.createElement('div'));
    const added = vi.spyOn(other, 'addEventListener');
    const removed = vi.spyOn(other, 'removeEventListener');
    swipeToClose(other, vi.fn()).destroy();
    expect(added.mock.calls).toHaveLength(4);
    expect(removed.mock.calls).toEqual(added.mock.calls);
  });
});
