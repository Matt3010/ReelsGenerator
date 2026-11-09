import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { expect, it } from 'vitest';
import Field from './Field.svelte';

it('puts the small label above its control', () => {
  const children = createRawSnippet(() => ({ render: () => '<input aria-label="Dettagli" />' }));
  const { container } = render(Field, { label: 'Dettagli', children });
  expect(container.querySelector('.field .eyebrow')).toHaveTextContent('Dettagli');
  expect(screen.getByRole('textbox', { name: 'Dettagli' })).toBeInTheDocument();
});
