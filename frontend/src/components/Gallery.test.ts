import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, type Snippet } from 'svelte';
import { expect, it } from 'vitest';
import Gallery from './Gallery.svelte';

it('lays the items out as one grid of squares, each drawn by the tile it is given', () => {
  const tile = createRawSnippet((item: () => { id: number; name: string }) => ({ render: () => `<span>${item().name}</span>` }));
  render(Gallery, { label: 'Le tue immagini', items: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }],
    key: (i: unknown) => (i as { id: number }).id, tile: tile as Snippet<[unknown]> });
  const list = screen.getByRole('list', { name: 'Le tue immagini' });
  expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['one', 'two']);
});
