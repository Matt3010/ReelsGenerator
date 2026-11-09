import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TagSuggestions } from '../lib/api';
import { PALETTE } from '../test/fixtures';
import PhotoComposer from './PhotoComposer.svelte';

const TAGS: TagSuggestions = {
  categories: [
    { id: 'subject', label: 'Soggetto', tags: ['a robot', 'an old fisherman'] },
    { id: 'place', label: 'Luogo', tags: ['a harbour'] },
    { id: 'era', label: 'Epoca', tags: ['1920s'] },
    { id: 'light', label: 'Luce', tags: ['golden hour'] },
    { id: 'framing', label: 'Inquadratura', tags: ['close-up'] },
  ],
  recent: [{ subject: ['a robot'], light: ['golden hour'] }],
};

function setup(onCreate = vi.fn(async () => {})) {
  render(PhotoComposer, { palette: PALETTE, loadTags: async () => TAGS, onCreate });
  return { onCreate, user: userEvent.setup() };
}

const group = (name: string) => screen.getByRole('group', { name });

describe('PhotoComposer', () => {
  it('composes the prompt from the chosen tags, in category order', async () => {
    const { user } = setup();
    await user.click(await within(await screen.findByRole('group', { name: 'Luce' })).findByRole('button', { name: 'golden hour' }));
    await user.click(within(group('Soggetto')).getByRole('button', { name: 'an old fisherman' }));
    expect(screen.getByLabelText(/prompt/i)).toHaveTextContent('an old fisherman, golden hour');
    expect(within(group('Soggetto')).getByRole('button', { name: 'an old fisherman' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a second click takes a tag away', async () => {
    const { user } = setup();
    const tag = await within(await screen.findByRole('group', { name: 'Epoca' })).findByRole('button', { name: '1920s' });
    await user.click(tag);
    await user.click(tag);
    expect(screen.getByLabelText(/prompt/i)).toHaveTextContent('');
  });

  it('adds a new tag of my own to a category', async () => {
    const { user } = setup();
    const place = await screen.findByRole('group', { name: 'Luogo' });
    await user.type(within(place).getByRole('textbox', { name: /nuovo tag/i }), 'a snowy village{Enter}');
    expect(within(place).getByRole('button', { name: 'a snowy village' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/prompt/i)).toHaveTextContent('a snowy village');
  });

  it('brings back a recent combination', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /a robot · golden hour/ }));
    expect(screen.getByLabelText(/prompt/i)).toHaveTextContent('a robot, golden hour');
  });

  it('sends tags, free text and how many pictures, then clears', async () => {
    const { user, onCreate } = setup();
    await user.click(await within(await screen.findByRole('group', { name: 'Soggetto' })).findByRole('button', { name: 'a robot' }));
    await user.type(screen.getByRole('textbox', { name: /dettagli/i }), 'holding an umbrella');
    await user.click(screen.getByRole('button', { name: /^quante immagini/i }));
    await user.click(await screen.findByRole('button', { name: '4 immagini' }));
    await user.click(screen.getByRole('button', { name: /genera immagini/i }));
    expect(onCreate).toHaveBeenCalledWith({ tags: { subject: ['a robot'] }, extra: 'holding an umbrella', count: 4,
      options: { style: 'toon', realPeople: false, avoid: true } });
    expect(screen.getByLabelText(/prompt/i)).toHaveTextContent('');
  });

  it('picks the style, with no switches that only matter to videos', async () => {
    const { user, onCreate } = setup();
    await user.click(await within(await screen.findByRole('group', { name: 'Soggetto' })).findByRole('button', { name: 'a robot' }));
    await user.click(screen.getByRole('button', { name: /^stile/i }));
    await user.click(await screen.findByRole('button', { name: 'Libero' }));
    expect(screen.queryByRole('switch', { name: /persone reali/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /genera immagini/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ options: { style: 'free', realPeople: false, avoid: true } }));
  });

  it('cannot generate an empty prompt', async () => {
    setup();
    await screen.findByRole('group', { name: 'Soggetto' });
    expect(screen.getByRole('button', { name: /genera immagini/i })).toBeDisabled();
  });
});
