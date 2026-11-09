import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App.svelte';
import { PALETTE } from './test/fixtures';

function fakeServer(jobs: unknown[]) {
  const posted: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (url === '/api/voices') return json({ 'en-US-GuyNeural': 'Guy (US, deep narrator)' });
    if (url === '/api/jobs' && init?.method === 'POST') {
      posted.push(JSON.parse(init.body as string));
      jobs.unshift({ id: '20261109-120000-aaaaaa', topic: 'New one', voice: 'en-US-GuyNeural', captions: true, news: null,
        state: 'queued', step: 'In coda', title: null, error: null, created: 3 });
      return json({ id: '20261109-120000-aaaaaa' });
    }
    if (url === '/api/jobs') return json(jobs);
    if (url === '/api/tags') return json({ categories: [], recent: [] });
    if (url === '/api/styles') return json(PALETTE);
    return json([]);
  }));
  return posted;
}

it('lists the videos and adds a new one at the top', async () => {
  const posted = fakeServer([{ id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'en-US-GuyNeural', captions: true, news: null,
    state: 'done', step: 'Fatto', title: 'The Great Molasses Flood', error: null, created: 1, duration: 25.6 }]);
  render(App);
  expect(await screen.findByRole('heading', { name: 'The Great Molasses Flood' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /argomento/i }), 'New one');
  await user.click(screen.getByRole('button', { name: /genera video/i }));
  expect(posted).toEqual([{ topic: 'New one', voice: 'en-US-GuyNeural', captions: true, news: null,
    options: { style: 'toon', realPeople: false, avoid: true } }]);
  expect(await screen.findByText('In coda')).toBeInTheDocument();
});

it('invites to start when there are no videos yet', async () => {
  fakeServer([]);
  render(App);
  expect(await screen.findByText(/ancora nessun video/i)).toBeInTheDocument();
});

it('switches to the pictures composer', async () => {
  fakeServer([]);
  render(App);
  await userEvent.setup().click(screen.getByRole('tab', { name: /immagini/i }));
  expect(screen.getByRole('tab', { name: /immagini/i })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: /genera immagini/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /genera video/i })).not.toBeInTheDocument();
});

it('shows videos under Video and pictures under Immagini, never mixed', async () => {
  fakeServer([
    { id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'v', captions: true, news: null, state: 'done', step: 'Fatto',
      title: 'The Great Molasses Flood', error: null, created: 2 },
    { id: '20261109-110000-bbbbbb', kind: 'photo', topic: 'a robot, golden hour', voice: '', captions: false, news: null, state: 'done',
      step: 'Fatto', title: null, error: null, created: 1, images: [7], photo: { tags: { subject: ['a robot'] }, extra: '', count: 1 } },
  ]);
  render(App);
  expect(await screen.findByRole('heading', { name: 'The Great Molasses Flood' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'I tuoi video' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'a robot, golden hour' })).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('tab', { name: /immagini/i }));
  expect(screen.getByRole('heading', { name: 'Le tue immagini' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'a robot, golden hour' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'The Great Molasses Flood' })).not.toBeInTheDocument();
});

it('invites to make the first pictures when there are none yet', async () => {
  fakeServer([]);
  render(App);
  await userEvent.setup().click(screen.getByRole('tab', { name: /immagini/i }));
  expect(await screen.findByText(/ancora nessuna immagine/i)).toBeInTheDocument();
});
