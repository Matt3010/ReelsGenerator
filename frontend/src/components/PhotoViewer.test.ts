import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import PhotoViewer from './PhotoViewer.svelte';

it('shows the picture large, the prompt it came from, and a download', () => {
  render(PhotoViewer, { id: 7, prompt: 'a robot, golden hour' });
  expect(screen.getByRole('img', { name: 'a robot, golden hour' })).toHaveAttribute('src', '/api/library/7/image');
  expect(screen.getByText('a robot, golden hour', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', '/api/library/7/image');
});
