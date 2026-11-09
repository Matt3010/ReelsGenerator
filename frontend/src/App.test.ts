import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App.svelte';
import { serverSays } from './test/event-source';
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
    if (url === '/api/styles') return json(PALETTE);
    return json([]);
  }));
  return posted;
}

it('lists the videos and adds a new one at the top', async () => {
  const posted = fakeServer([{ id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'en-US-GuyNeural', captions: true, news: null,
    state: 'done', step: 'Fatto', title: 'The Great Molasses Flood', error: null, created: 1, duration: 25.6 }]);
  render(App);
  expect(await screen.findByRole('button', { name: 'The Great Molasses Flood' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /nuovo video/i }));
  const dialog = await screen.findByRole('dialog', { name: /nuovo video/i });
  await user.type(within(dialog).getByRole('textbox', { name: /argomento/i }), 'New one');
  await user.click(within(dialog).getByRole('button', { name: /genera video/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(posted).toEqual([{ topic: 'New one', voice: 'en-US-GuyNeural', captions: true, news: null,
    options: { style: 'toon', realPeople: false, avoid: true, model: 'dreamshaper' } }]);
  expect(await screen.findByRole('button', { name: 'New one · In coda' })).toBeInTheDocument();
});

it('invites to start when there are no videos yet', async () => {
  fakeServer([]);
  render(App);
  expect(await screen.findByText(/ancora nessun video/i)).toBeInTheDocument();
});

it('switches to pictures, whose composer opens in a modal', async () => {
  fakeServer([]);
  render(App);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('link', { name: /immagini/i }));
  expect(screen.getByRole('link', { name: /immagini/i })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: /nuovo video/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /nuova immagine/i }));
  const dialog = await screen.findByRole('dialog', { name: /nuova immagine/i });
  expect(within(dialog).getByRole('button', { name: /genera immagine/i })).toBeInTheDocument();
});

it('shows videos under Video and pictures under Immagini, never mixed', async () => {
  fakeServer([
    { id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'v', captions: true, news: null, state: 'done', step: 'Fatto',
      title: 'The Great Molasses Flood', error: null, created: 2 },
    { id: '20261109-110000-bbbbbb', kind: 'photo', topic: 'a robot, golden hour', voice: '', captions: false, news: null, state: 'done',
      step: 'Fatto', title: null, error: null, created: 1, images: [{ id: 7, url: '/reels-images/abc.png?X-Amz-Signature=s1' }], photo: { prompt: 'a robot, golden hour', negative: '', count: 1 } },
  ]);
  render(App);
  expect(await screen.findByRole('button', { name: 'The Great Molasses Flood' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'I tuoi video' })).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Le tue immagini' })).not.toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: /immagini/i }));
  const gallery = screen.getByRole('list', { name: 'Le tue immagini' });
  expect(gallery.querySelector('img')).toHaveAttribute('src', '/reels-images/abc.png?X-Amz-Signature=s1');
  expect(screen.queryByRole('button', { name: 'The Great Molasses Flood' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'a robot, golden hour' }));
  const viewer = await screen.findByRole('dialog');
  expect(within(viewer).getByRole('img', { name: 'a robot, golden hour' })).toHaveAttribute('src', '/reels-images/abc.png?X-Amz-Signature=s1');
});

it('invites to make the first pictures when there are none yet', async () => {
  fakeServer([]);
  render(App);
  await userEvent.setup().click(screen.getByRole('link', { name: /immagini/i }));
  expect(await screen.findByText(/ancora nessuna immagine/i)).toBeInTheDocument();
});

it('opens a video in a modal, with its player and script button', async () => {
  fakeServer([{ id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'v', captions: true, news: null, state: 'done', step: 'Fatto',
    title: 'The Great Molasses Flood', error: null, created: 2,
    video: { url: '/reels-videos/j.mp4?X-Amz-Signature=s2', download: '/reels-videos/j.mp4?X-Amz-Signature=s3' } }]);
  render(App);
  await userEvent.setup().click(await screen.findByRole('button', { name: /The Great Molasses Flood/ }));
  const dialog = await screen.findByRole('dialog', { name: 'The Great Molasses Flood' });
  expect(dialog.querySelector('video[controls]')).toHaveAttribute('src', '/reels-videos/j.mp4?X-Amz-Signature=s2');
  expect(within(dialog).getByRole('button', { name: /copione/i })).toBeInTheDocument();
});

it('keeps a picture job still at work as a tile above the gallery', async () => {
  fakeServer([{ id: '20261109-110000-cccccc', kind: 'photo', topic: 'a fox', voice: '', captions: false, news: null, state: 'running',
    step: "Disegno l'immagine 1/2", title: null, error: null, created: 1, photo: { prompt: 'a fox', negative: '', count: 2 } }]);
  render(App);
  await userEvent.setup().click(await screen.findByRole('link', { name: /immagini/i }));
  expect(await screen.findByRole('button', { name: "a fox · Disegno l'immagine 1/2" })).toBeInTheDocument();
});

it('follows the server: a change it announces shows up without asking every few seconds', async () => {
  const jobs: unknown[] = [];
  fakeServer(jobs);
  render(App);
  expect(await screen.findByText(/ancora nessun video/i)).toBeInTheDocument();
  jobs.push({ id: '20261109-130000-dddddd', topic: 'Fresh', voice: 'v', captions: true, news: null, state: 'running',
    step: 'Il modello scrive la storia', title: null, error: null, created: 4 });
  serverSays();
  expect(await screen.findByRole('button', { name: 'Fresh · Il modello scrive la storia' })).toBeInTheDocument();
});

it('names a picture job "Immagini" in its modal, not by its whole prompt', async () => {
  fakeServer([{ id: '20261109-110000-eeeeee', kind: 'photo', topic: 'a very long prompt '.repeat(10), voice: '', captions: false, news: null,
    state: 'error', step: 'Errore', title: null, error: 'boom', created: 1, photo: { prompt: 'x', negative: '', count: 1 } }]);
  render(App);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('link', { name: /immagini/i }));
  await user.click(await screen.findByRole('button', { name: /a very long prompt/ }));
  expect(await screen.findByRole('dialog', { name: 'Immagini' })).toBeInTheDocument();
});

it('an open job follows the server: its step changes while the modal is open', async () => {
  const job = { id: '20261109-101021-61aa49', topic: 'Molasses', voice: 'en-US-GuyNeural', captions: true, news: null,
    state: 'running', step: 'Immagini', title: 'The Great Molasses Flood', error: null, created: 1 };
  fakeServer([job]);
  render(App);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /molasses flood/i }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/^Immagini/)).toBeInTheDocument();
  job.step = "Disegno l'immagine 2/5";
  serverSays();
  expect(await within(dialog).findByText(/^Disegno l'immagine 2\/5/)).toBeInTheDocument();
});

it('opens the Sistema page from the bar, without the job buttons', async () => {
  fakeServer([]);
  render(App);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('link', { name: /sistema/i }));
  expect(await screen.findByRole('heading', { name: 'Sistema' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /nuovo video|nuova immagine/i })).not.toBeInTheDocument();
});
