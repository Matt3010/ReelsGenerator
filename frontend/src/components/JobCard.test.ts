import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JobInfo } from '../lib/api';
import { OPTIONS } from '../test/fixtures';
import { ui } from '../lib/ui.svelte';
import JobCard from './JobCard.svelte';

const base: JobInfo = {
  id: '20261109-104755-a5b477', topic: 'Cruise ship pianist rescued', voice: 'en-US-GuyNeural', captions: true, news: null,
  state: 'running', step: "Disegno l'immagine 3/8", title: null, error: null, created: 1, options: OPTIONS,
};

describe('JobCard', () => {
  it('shows the step while it works', () => {
    render(JobCard, { job: base, onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByText("Disegno l'immagine 3/8")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /scarica/i })).not.toBeInTheDocument();
  });

  it('counts the time while it works, and says how long it took', () => {
    const now = Date.now() / 1000;
    const { unmount } = render(JobCard, { job: { ...base, started: now - 75 }, onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByText("Disegno l'immagine 3/8 · 1 min 15 s")).toBeInTheDocument();
    unmount();
    render(JobCard, { job: { ...base, state: 'done', step: 'Fatto', started: now - 1200, finished: now - 100 },
      onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByText(/in 18 min 20 s/)).toBeInTheDocument();
  });

  it('a failed job did not get done', () => {
    const now = Date.now() / 1000;
    render(JobCard, { job: { ...base, state: 'error', error: 'x', started: now - 60, finished: now },
      onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.queryByText(/fatto in/)).not.toBeInTheDocument();
  });

  it('does not repeat the topic the modal already has as its title', () => {
    const job: JobInfo = { ...base, news: { title: 't', url: 'u', published: '', outlet: 'CBS News', summary: '' } };
    const { container } = render(JobCard, { job, onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(container.querySelector('.sotto')).toHaveTextContent(/^CBS News$/);
  });

  it('plays and downloads a finished video, and names its source', () => {
    const job: JobInfo = { ...base, state: 'done', step: 'Fatto', title: 'Pianist rescued', duration: 26.2,
      news: { title: 't', url: 'https://bbc.co.uk/a', published: '', outlet: 'BBC News', summary: '' } };
    const { container } = render(JobCard, { job, onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(container.querySelector('video')).toHaveAttribute('src', `/api/jobs/${base.id}/video`);
    expect(screen.getByText(/BBC News/)).toBeInTheDocument();
    expect(screen.getByText(/26 s/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', `/api/jobs/${base.id}/video`);
  });

  it('tells the error and retries', async () => {
    const onRetry = vi.fn();
    render(JobCard, { job: { ...base, state: 'error', error: 'ffmpeg failed' }, onRetry, onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByRole('alert')).toHaveTextContent('ffmpeg failed');
    await userEvent.setup().click(screen.getByRole('button', { name: /riprova/i }));
    expect(onRetry).toHaveBeenCalledWith(base.id);
  });

  it('opens the script', async () => {
    const loadStory = vi.fn(async () => ({ scenes: [{ narration: 'A pianist fell overboard.' }, { narration: 'Fishermen found him.' }] }));
    render(JobCard, { job: { ...base, state: 'done', title: 'T' }, onRetry: vi.fn(), onDelete: vi.fn(), loadStory });
    await userEvent.setup().click(screen.getByRole('button', { name: /copione/i }));
    expect(await screen.findByText('A pianist fell overboard.')).toBeInTheDocument();
    expect(screen.getByText('Fishermen found him.')).toBeInTheDocument();
  });
});

describe('JobCard deleting', () => {
  it('deletes a finished job after a yes next to the button', async () => {
    const onDelete = vi.fn();
    render(JobCard, { job: { ...base, state: 'done', title: 'T' }, onRetry: vi.fn(), onDelete, loadStory: vi.fn() });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /elimina/i }));
    expect(ui.sure?.title).toMatch(/eliminare/i);
    ui.sure!.onYes();
    expect(onDelete).toHaveBeenCalledWith(base.id);
  });

  it('cannot delete a job still at work', () => {
    render(JobCard, { job: base, onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.queryByRole('button', { name: /elimina/i })).not.toBeInTheDocument();
  });
});

describe('JobCard for a picture job', () => {
  it('shows what the pictures were asked with', () => {
    render(JobCard, { job: { ...base, kind: 'photo', topic: 'a fox',
      photo: { prompt: 'a fox', negative: 'blurry', count: 1, format: 'square', seed: null, resolution: 'standard' } },
      onRetry: vi.fn(), onDelete: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByText('Negative prompt', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('Quadrato 1:1')).toBeInTheDocument();
  });
});
