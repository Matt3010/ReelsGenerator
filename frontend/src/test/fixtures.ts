import type { JobOptions, Palette } from '../lib/api';

/* What the server says about styles, as the tests' server says it. */
export const OPTIONS: JobOptions = { style: 'toon', realPeople: false, avoid: true, model: 'dreamshaper' };
export const PALETTE: Palette = {
  styles: [{ id: 'toon', label: 'Cartoon' }, { id: 'realistic', label: 'Realistico' }, { id: 'free', label: 'Libero' }],
  defaults: OPTIONS,
  models: [
    { id: 'dreamshaper', label: 'DreamShaper XL Turbo', note: 'SDXL, il più veloce', negative: true, img2img: true, minutes: { standard: 1.5, fullhd: 5, '4k': 10 } },
    { id: 'zimage', label: 'Z-Image Turbo', note: 'foto realistiche', negative: false, img2img: true, minutes: { standard: 2.5, fullhd: 6, '4k': 9 } },
    { id: 'lustify', label: 'LUSTIFY! v9', note: 'SDXL NSFW', negative: true, img2img: false, minutes: { standard: 4, fullhd: 10, '4k': 15 } },
  ],
};
