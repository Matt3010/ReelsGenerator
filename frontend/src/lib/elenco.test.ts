import { describe, expect, it } from 'vitest';
import { quasiInFondo } from './elenco';

/** A list that scrolls: as tall as its content, as tall as its window, scrolled so far. */
const lista = (scrollHeight: number, clientHeight: number, scrollTop: number) => ({ scrollHeight, clientHeight, scrollTop });

describe('a list scrolled', () => {
  it('is near its end once less than half a window is left below', () => {
    expect(quasiInFondo(lista(1000, 200, 701))).toBe(true);
    expect(quasiInFondo(lista(1000, 200, 800))).toBe(true);
  });

  it('is not, with half a window or more still below', () => {
    expect(quasiInFondo(lista(1000, 200, 700))).toBe(false);
    expect(quasiInFondo(lista(1000, 200, 0))).toBe(false);
  });
});
