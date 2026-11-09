import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { nav } from '../lib/nav.svelte';
import { FakeEventSource } from './event-source';

// jsdom knows no media queries: a desktop with a mouse, wide and light
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList;
// nor Server-Sent Events: the app follows the server's with one
window.EventSource ??= FakeEventSource as unknown as typeof EventSource;
// nor scrolling
Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => {
  // every test starts at home
  nav.go('/', { replace: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
