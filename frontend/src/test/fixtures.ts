import type { JobOptions, Palette } from '../lib/api';

/* What the server says about styles, as the tests' server says it. */
export const OPTIONS: JobOptions = { style: 'toon', realPeople: false, avoid: true };
export const PALETTE: Palette = {
  styles: [{ id: 'toon', label: 'Cartoon' }, { id: 'realistic', label: 'Realistico' }, { id: 'free', label: 'Libero' }],
  defaults: OPTIONS,
};
