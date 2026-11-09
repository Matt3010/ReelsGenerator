import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PhotoComposer from './PhotoComposer.svelte';

function setup(onCreate = vi.fn(async () => {})) {
  render(PhotoComposer, { onCreate });
  return { onCreate, user: userEvent.setup() };
}

describe('PhotoComposer', () => {
  it('sends the prompt and the negative prompt as written, then clears', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a cybergirl, neon rain, 8k');
    await user.type(screen.getByRole('textbox', { name: /negative prompt/i }), 'blurry, extra fingers');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith({ prompt: 'a cybergirl, neon rain, 8k', negative: 'blurry, extra fingers', count: 1,
      format: 'portrait', seed: null, resolution: 'standard' });
    expect(screen.getByRole('textbox', { name: /^prompt/i })).toHaveValue('');
  });

  it('lets me pick format and how many, and fix the seed', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a fox');
    await user.click(screen.getByRole('button', { name: /^formato/i }));
    await user.click(await screen.findByRole('button', { name: /orizzontale/i }));
    await user.click(screen.getByRole('button', { name: /^quante/i }));
    await user.click(await screen.findByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^risoluzione/i }));
    await user.click(await screen.findByRole('button', { name: /full hd/i }));
    await user.type(screen.getByRole('textbox', { name: /seed/i }), '42');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ format: 'landscape', count: 4, seed: 42, resolution: 'fullhd' }));
  });

  it('takes a long prompt', () => {
    setup();
    expect(screen.getByRole('textbox', { name: /^prompt/i })).toHaveAttribute('maxlength', '2000');
    expect(screen.getByRole('textbox', { name: /negative prompt/i })).toHaveAttribute('maxlength', '2000');
  });

  it('cannot generate without a prompt', () => {
    setup();
    expect(screen.getByRole('button', { name: /genera/i })).toBeDisabled();
  });

  it('shows why it could not start', async () => {
    const { user } = setup(vi.fn(async () => { throw new Error('write a prompt'); }));
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'x');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('write a prompt');
  });
});
