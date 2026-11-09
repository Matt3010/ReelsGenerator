import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PALETTE } from '../test/fixtures';
import PhotoComposer from './PhotoComposer.svelte';

function setup(onCreate = vi.fn(async () => {}), upload = vi.fn(async () => 'k-1')) {
  render(PhotoComposer, { onCreate, models: PALETTE.models, upload });
  return { onCreate, upload, user: userEvent.setup() };
}

describe('PhotoComposer', () => {
  it('sends the prompt and the negative prompt as written, then clears', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a cybergirl, neon rain, 8k');
    await user.type(screen.getByRole('textbox', { name: /negative prompt/i }), 'blurry, extra fingers');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith({ prompt: 'a cybergirl, neon rain, 8k', negative: 'blurry, extra fingers', count: 1,
      format: 'portrait', seed: null, resolution: 'standard', model: 'dreamshaper' });
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

  it('lets me pick the model, and drops the negative prompt for a model that ignores it', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a fox');
    await user.type(screen.getByRole('textbox', { name: /negative prompt/i }), 'blurry');
    await user.click(screen.getByRole('button', { name: /^modello/i }));
    await user.click(await screen.findByRole('button', { name: /z-image turbo/i }));
    expect(screen.queryByRole('textbox', { name: /negative prompt/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'zimage', negative: '' }));
  });

  it('says how long each resolution takes with the chosen model', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /^risoluzione/i }));
    expect(await screen.findByText('1,5 min circa')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /^modello/i }));
    await user.click(await screen.findByRole('button', { name: /z-image turbo/i }));
    await user.click(screen.getByRole('button', { name: /^risoluzione/i }));
    expect(await screen.findByText('2,5 min circa')).toBeInTheDocument();
    expect(screen.getByText('6 min circa')).toBeInTheDocument();
  });

  it('can start from a picture of mine: uploaded as soon as chosen, then changed by how much I say', async () => {
    const { user, onCreate, upload } = setup();
    globalThis.URL.createObjectURL ??= () => 'blob:preview';
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'the same street at night');
    const file = new File([new Uint8Array(8)], 'street.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/parti da un'immagine/i), file);
    expect(upload).toHaveBeenCalledWith(file);
    const howMuch = await screen.findByRole('slider', { name: /quanto cambiarla/i });
    expect(howMuch).toHaveValue('0.6');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ init: { key: 'k-1', strength: 0.6 } }));
  });

  it('a model that draws only from text does not offer a picture to start from', async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole('button', { name: /^modello/i }));
    await user.click(await screen.findByRole('button', { name: /lustify/i }));
    expect(screen.queryByLabelText(/parti da un'immagine/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a fox');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'lustify' }));
  });

  it('without a picture of mine, starts from nothing', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), 'a fox');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.not.objectContaining({ init: expect.anything() }));
  });

  it('starts from the settings of a picture, to tune its prompt with the same seed', async () => {
    const onCreate = vi.fn(async () => {});
    render(PhotoComposer, { onCreate, models: PALETTE.models, upload: vi.fn(),
      initial: { prompt: 'a fox at dawn', negative: 'blurry', count: 1, format: 'landscape', seed: 1234, resolution: 'fullhd',
        model: 'zimage', init: { key: 'k-1', strength: 0.4, url: '/reels-uploads/k-1?s' } } });
    const user = userEvent.setup();
    expect(screen.getByRole('textbox', { name: /^prompt/i })).toHaveValue('a fox at dawn');
    expect(screen.getByRole('textbox', { name: /seed/i })).toHaveValue('1234');
    expect(screen.getByRole('slider', { name: /quanto cambiarla/i })).toHaveValue('0.4');
    await user.type(screen.getByRole('textbox', { name: /^prompt/i }), ', foggy');
    await user.click(screen.getByRole('button', { name: /genera/i }));
    expect(onCreate).toHaveBeenCalledWith({ prompt: 'a fox at dawn, foggy', negative: '', count: 1, format: 'landscape', seed: 1234,
      resolution: 'fullhd', model: 'zimage', init: { key: 'k-1', strength: 0.4 } });
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
