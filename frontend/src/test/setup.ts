import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom knows no media queries: a desktop with a mouse, wide and light
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList;
// nor scrolling
Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
