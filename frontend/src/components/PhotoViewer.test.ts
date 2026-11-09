import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ui } from '../lib/ui.svelte';
import { PALETTE } from '../test/fixtures';
import PhotoViewer from './PhotoViewer.svelte';

const PHOTO = { prompt: 'a robot, golden hour', negative: '', count: 1, format: 'landscape' as const, seed: null, resolution: 'fullhd' as const };

it('shows the picture large, its properties with its own seed and size, and a download', async () => {
  render(PhotoViewer, { id: 7, prompt: 'a robot, golden hour', photo: null, models: PALETTE.models, onDelete: vi.fn(),
    loadInfo: async () => ({ id: 7, prompt: 'a robot, golden hour', seed: 1234, width: 1920, height: 1080, model: 'zimage' }) });
  expect(await screen.findByText('Z-Image Turbo')).toBeInTheDocument();
  expect(await screen.findByText('1234')).toBeInTheDocument();
  expect(screen.getByText('1920×1080')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'a robot, golden hour' })).toHaveAttribute('src', '/api/library/7/image');
  expect(screen.getByText('a robot, golden hour', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', '/api/library/7/image');
});

it('deletes the picture after a yes next to the button', async () => {
  const onDelete = vi.fn();
  render(PhotoViewer, { id: 7, prompt: 'a robot', photo: null, models: PALETTE.models, onDelete, loadInfo: async () => null });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /elimina/i }));
  expect(ui.sure?.title).toMatch(/eliminare/i);
  ui.sure!.onYes();
  expect(onDelete).toHaveBeenCalledWith(7);
});
