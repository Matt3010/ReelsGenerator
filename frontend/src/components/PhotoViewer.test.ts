import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ui } from '../lib/ui.svelte';
import { PALETTE } from '../test/fixtures';
import PhotoViewer from './PhotoViewer.svelte';

const PHOTO = { prompt: 'a robot, golden hour', negative: '', count: 1, format: 'landscape' as const, seed: null, resolution: 'fullhd' as const };

it('shows the picture large, its properties with its own seed and size, and a download', async () => {
  render(PhotoViewer, { id: 7, url: '/reels-images/abc.png?X-Amz-Signature=s1', prompt: 'a robot, golden hour', photo: null, took: 300, models: PALETTE.models, onDelete: vi.fn(),
    loadInfo: async () => ({ id: 7, prompt: 'a robot, golden hour', seed: 1234, width: 1920, height: 1080, model: 'zimage' }) });
  expect(await screen.findByText('Z-Image Turbo')).toBeInTheDocument();
  expect(screen.getByText('5 min')).toBeInTheDocument();
  expect(await screen.findByText('1234')).toBeInTheDocument();
  expect(screen.getByText('1920×1080')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'a robot, golden hour' })).toHaveAttribute('src', '/reels-images/abc.png?X-Amz-Signature=s1');
  expect(screen.getByText('a robot, golden hour', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', '/reels-images/abc.png?X-Amz-Signature=s1');
});

it("regenerates: the same request, with this picture's own seed", async () => {
  const onRegenerate = vi.fn();
  const photo = { ...PHOTO, count: 3, seed: null, model: 'zimage' };
  render(PhotoViewer, { id: 7, url: '/x', prompt: 'a robot', photo, models: PALETTE.models, onDelete: vi.fn(), onRegenerate,
    loadInfo: async () => ({ id: 7, prompt: 'a robot', seed: 4242, width: 1920, height: 1080, model: 'zimage' }) });
  await screen.findByText('4242');
  await userEvent.setup().click(screen.getByRole('button', { name: /rigenera/i }));
  expect(onRegenerate).toHaveBeenCalledWith({ ...photo, count: 1, seed: 4242 });
});

it('deletes the picture after a yes next to the button', async () => {
  const onDelete = vi.fn();
  render(PhotoViewer, { id: 7, url: '/reels-images/abc.png?X-Amz-Signature=s1', prompt: 'a robot', photo: null, models: PALETTE.models, onDelete, loadInfo: async () => null });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /elimina/i }));
  expect(ui.sure?.title).toMatch(/eliminare/i);
  ui.sure!.onYes();
  expect(onDelete).toHaveBeenCalledWith(7);
});

it('shows before and after when the picture started from a photo of mine', () => {
  render(PhotoViewer, { id: 7, url: '/reels-images/abc.png?X-Amz-Signature=s1', before: '/reels-uploads/k?s=1', prompt: 'the street at night',
    photo: null, models: PALETTE.models, onDelete: vi.fn(), loadInfo: async () => null });
  expect(screen.getByRole('slider', { name: /prima e dopo/i })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /prima/i })).toHaveAttribute('src', '/reels-uploads/k?s=1');
});
