import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ui } from '../lib/ui.svelte';
import PhotoViewer from './PhotoViewer.svelte';

it('shows the picture large, the prompt it came from, and a download', () => {
  render(PhotoViewer, { id: 7, prompt: 'a robot, golden hour', onDelete: vi.fn() });
  expect(screen.getByRole('img', { name: 'a robot, golden hour' })).toHaveAttribute('src', '/api/library/7/image');
  expect(screen.getByText('a robot, golden hour', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', '/api/library/7/image');
});

it('deletes the picture after a yes next to the button', async () => {
  const onDelete = vi.fn();
  render(PhotoViewer, { id: 7, prompt: 'a robot', onDelete });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /elimina/i }));
  expect(ui.sure?.title).toMatch(/eliminare/i);
  ui.sure!.onYes();
  expect(onDelete).toHaveBeenCalledWith(7);
});
