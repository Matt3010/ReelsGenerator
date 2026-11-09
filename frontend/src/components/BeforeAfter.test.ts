import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import BeforeAfter from './BeforeAfter.svelte';

it('lays the picture before over the one after, cut where the slider says', async () => {
  render(BeforeAfter, { before: '/reels-uploads/k?s=1', after: '/reels-images/a.png?s=2', alt: 'a street at night' });
  expect(screen.getByRole('img', { name: /prima/i })).toHaveAttribute('src', '/reels-uploads/k?s=1');
  expect(screen.getByRole('img', { name: /dopo/i })).toHaveAttribute('src', '/reels-images/a.png?s=2');
  const slider = screen.getByRole('slider', { name: /prima e dopo/i });
  expect(slider).toHaveValue('50');
  const layer = screen.getByRole('img', { name: /prima/i }).parentElement!;
  expect(layer.style.clipPath).toBe('inset(0 50% 0 0)');
  await fireEvent.input(slider, { target: { value: '20' } });
  expect(layer.style.clipPath).toBe('inset(0 80% 0 0)');
});
