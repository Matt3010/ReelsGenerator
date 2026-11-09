import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TagGroup from './TagGroup.svelte';

describe('TagGroup', () => {
  it('shows the tags, the chosen ones pressed, and toggles on click', async () => {
    const ontoggle = vi.fn();
    render(TagGroup, { label: 'Luce', tags: ['golden hour', 'foggy'], chosen: ['foggy'], ontoggle });
    const group = screen.getByRole('group', { name: 'Luce' });
    expect(within(group).getByRole('button', { name: 'foggy' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'golden hour' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(within(group).getByRole('button', { name: 'golden hour' }));
    expect(ontoggle).toHaveBeenCalledWith('golden hour');
  });

  it('adds a tag of my own when it offers the field', async () => {
    const onadd = vi.fn();
    render(TagGroup, { label: 'Luogo', tags: [], chosen: [], ontoggle: vi.fn(), onadd });
    const input = screen.getByRole('textbox', { name: 'Nuovo tag: Luogo' });
    await userEvent.setup().type(input, '  a snowy village {Enter}');
    expect(onadd).toHaveBeenCalledWith('a snowy village');
    expect(input).toHaveValue('');
  });

  it('has no field without onadd', () => {
    render(TagGroup, { label: 'Recenti', tags: ['a'], chosen: [], ontoggle: vi.fn() });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
