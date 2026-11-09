import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { PALETTE } from '../test/fixtures';
import PhotoProperties from './PhotoProperties.svelte';

const photo = { prompt: 'a lighthouse at golden hour', negative: 'blurry', count: 2, format: 'landscape' as const, seed: 1234,
  resolution: 'fullhd' as const, model: 'zimage' };

const value = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling?.textContent;

it('lists what the pictures were asked with', () => {
  render(PhotoProperties, { photo, models: PALETTE.models });
  expect(value('Modello')).toBe('Z-Image Turbo');
  expect(value('Prompt')).toBe('a lighthouse at golden hour');
  expect(value('Negative prompt')).toBe('blurry');
  expect(value('Formato')).toBe('Orizzontale 16:9');
  expect(value('Risoluzione')).toBe('Full HD');
  expect(value('Quante')).toBe('2');
  expect(value('Seed')).toBe('1234');
});

it("pictures from before the model choice were DreamShaper's", () => {
  render(PhotoProperties, { photo: { ...photo, model: undefined }, models: PALETTE.models });
  expect(value('Modello')).toBe('DreamShaper XL Turbo');
});

it('says when the seed was random and the negative prompt empty', () => {
  render(PhotoProperties, { photo: { ...photo, seed: null, negative: '' } });
  expect(value('Seed')).toBe('casuale');
  expect(value('Negative prompt')).toBe('—');
});

it('for one picture, its own seed and its size', () => {
  render(PhotoProperties, { photo: { ...photo, seed: null }, seed: 1235, size: [1920, 1080] });
  expect(value('Seed')).toBe('1235');
  expect(value('Misura')).toBe('1920×1080');
  expect(screen.queryByText('Quante', { selector: 'dt' })).not.toBeInTheDocument();
});
