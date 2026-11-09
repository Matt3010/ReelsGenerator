import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '../lib/api';
import { PALETTE } from '../test/fixtures';
import Composer from './Composer.svelte';

const NEWS: NewsItem[] = [
  { title: 'Bridge reopens after storm', url: 'https://bbc.co.uk/a1', published: '2026-11-09T07:26:09Z', outlet: 'BBC News', summary: 's' },
  { title: 'Rocket lands on a barge', url: 'https://g.co/x', published: '2026-11-09T01:10:00Z', outlet: 'The Guardian', summary: 's' },
];
const VOICES = { 'en-US-GuyNeural': 'Guy (US, deep narrator)', 'en-GB-RyanNeural': 'Ryan (UK)' };

function setup(over: Partial<{ loadNews: () => Promise<NewsItem[]>; onCreate: (r: unknown) => Promise<void> }> = {}) {
  const onCreate = over.onCreate ?? vi.fn(async () => {});
  const loadNews = over.loadNews ?? vi.fn(async () => NEWS);
  render(Composer, { voices: VOICES, palette: PALETTE, loadNews, onCreate });
  return { onCreate, loadNews, user: userEvent.setup() };
}

describe('Composer', () => {
  it("shows today's news and turns one into the topic, with its source", async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /notizie di oggi/i }));
    await user.click(await screen.findByRole('button', { name: /Bridge reopens after storm/ }));
    expect(screen.getByRole('textbox', { name: /argomento/i })).toHaveValue('Bridge reopens after storm');
    expect(screen.getByText(/Fonte:/)).toHaveTextContent('BBC News');
  });

  it('forgets the source once the topic is typed by hand', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /notizie di oggi/i }));
    await user.click(await screen.findByRole('button', { name: /Bridge reopens/ }));
    await user.type(screen.getByRole('textbox', { name: /argomento/i }), '!');
    expect(screen.queryByText(/Fonte:/)).not.toBeInTheDocument();
  });

  it('says so when there is no news', async () => {
    const { user } = setup({ loadNews: async () => [] });
    await user.click(screen.getByRole('button', { name: /notizie di oggi/i }));
    expect(await screen.findByText(/nessuna notizia/i)).toBeInTheDocument();
  });

  it('sends topic, voice, captions and the chosen news, then clears', async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole('button', { name: /notizie di oggi/i }));
    await user.click(await screen.findByRole('button', { name: /Rocket lands/ }));
    await user.click(screen.getByRole('button', { name: /^voce/i }));
    await user.click(await screen.findByRole('button', { name: 'Ryan (UK)' }));
    await user.click(screen.getByRole('switch', { name: /sottotitoli/i }));
    await user.click(screen.getByRole('button', { name: /genera video/i }));
    expect(onCreate).toHaveBeenCalledWith({ topic: 'Rocket lands on a barge', voice: 'en-GB-RyanNeural', captions: false, news: NEWS[1],
      options: { style: 'toon', realPeople: false, avoid: true } });
    expect(screen.getByRole('textbox', { name: /argomento/i })).toHaveValue('');
  });

  it('a hand-written topic goes without news', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /argomento/i }), 'The Great Molasses Flood');
    await user.click(screen.getByRole('button', { name: /genera video/i }));
    expect(onCreate).toHaveBeenCalledWith({ topic: 'The Great Molasses Flood', voice: 'en-US-GuyNeural', captions: true, news: null,
      options: { style: 'toon', realPeople: false, avoid: true } });
  });

  it('lets me pick the style and lift the limits', async () => {
    const { user, onCreate } = setup();
    await user.type(screen.getByRole('textbox', { name: /argomento/i }), 'x');
    await user.click(screen.getByRole('button', { name: /opzioni/i }));
    await user.click(screen.getByRole('button', { name: /^stile/i }));
    await user.click(await screen.findByRole('button', { name: 'Realistico' }));
    await user.click(screen.getByRole('switch', { name: /persone reali/i }));
    await user.click(screen.getByRole('switch', { name: /anacronismi/i }));
    await user.click(screen.getByRole('button', { name: /genera video/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ options: { style: 'realistic', realPeople: true, avoid: false } }));
  });

  it('cannot generate without a topic', () => {
    setup();
    expect(screen.getByRole('button', { name: /genera video/i })).toBeDisabled();
  });

  it('shows why a job could not start', async () => {
    const { user } = setup({ onCreate: async () => { throw new Error('unknown voice'); } });
    await user.type(screen.getByRole('textbox', { name: /argomento/i }), 'x');
    await user.click(screen.getByRole('button', { name: /genera video/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown voice');
  });
});
