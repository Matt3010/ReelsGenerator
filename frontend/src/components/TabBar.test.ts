import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { nav } from '../lib/nav.svelte';
import TabBar from './TabBar.svelte';

it('shows the sections at the bottom, the current one marked', () => {
  nav.go('/immagini');
  render(TabBar);
  expect(screen.getByRole('navigation', { name: 'Sezioni' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Immagini' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Video' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: 'Video' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Sistema' })).toHaveAttribute('href', '/sistema');
});
