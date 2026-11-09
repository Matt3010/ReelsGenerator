import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JobInfo } from '../lib/api';
import JobCard from './JobCard.svelte';

const base: JobInfo = {
  id: '20261109-104755-a5b477', topic: 'Cruise ship pianist rescued', voice: 'en-US-GuyNeural', captions: true, news: null,
  state: 'running', step: "Disegno l'immagine 3/8", title: null, error: null, created: 1,
};

describe('JobCard', () => {
  it('shows the step while it works', () => {
    render(JobCard, { job: base, onRetry: vi.fn(), loadStory: vi.fn() });
    expect(screen.getByText("Disegno l'immagine 3/8")).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /avanzamento/i })).toHaveAttribute('aria-valuenow', '3');
    expect(screen.queryByRole('link', { name: /scarica/i })).not.toBeInTheDocument();
  });

  it('plays and downloads a finished video, and names its source', () => {
    const job: JobInfo = { ...base, state: 'done', step: 'Fatto', title: 'Pianist rescued', duration: 26.2,
      news: { title: 't', url: 'https://bbc.co.uk/a', published: '', outlet: 'BBC News', summary: '' } };
    const { container } = render(JobCard, { job, onRetry: vi.fn(), loadStory: vi.fn() });
    expect(container.querySelector('video')).toHaveAttribute('src', `/api/jobs/${base.id}/video`);
    expect(screen.getByRole('heading', { name: 'Pianist rescued' })).toBeInTheDocument();
    expect(screen.getByText(/BBC News/)).toBeInTheDocument();
    expect(screen.getByText(/26 s/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scarica/i })).toHaveAttribute('href', `/api/jobs/${base.id}/video`);
  });

  it('tells the error and retries', async () => {
    const onRetry = vi.fn();
    render(JobCard, { job: { ...base, state: 'error', error: 'ffmpeg failed' }, onRetry, loadStory: vi.fn() });
    expect(screen.getByRole('alert')).toHaveTextContent('ffmpeg failed');
    await userEvent.setup().click(screen.getByRole('button', { name: /riprova/i }));
    expect(onRetry).toHaveBeenCalledWith(base.id);
  });

  it('opens the script', async () => {
    const loadStory = vi.fn(async () => ({ scenes: [{ narration: 'A pianist fell overboard.' }, { narration: 'Fishermen found him.' }] }));
    render(JobCard, { job: { ...base, state: 'done', title: 'T' }, onRetry: vi.fn(), loadStory });
    await userEvent.setup().click(screen.getByRole('button', { name: /copione/i }));
    expect(await screen.findByText('A pianist fell overboard.')).toBeInTheDocument();
    expect(screen.getByText('Fishermen found him.')).toBeInTheDocument();
  });
});

describe('JobCard for pictures', () => {
  it('shows the pictures of a photo job, each opening full size', () => {
    const job: JobInfo = { ...base, kind: 'photo', state: 'done', step: 'Fatto', topic: 'a robot, golden hour', images: [7, 9],
      photo: { tags: { subject: ['a robot'] }, extra: '', count: 2 } };
    render(JobCard, { job, onRetry: vi.fn(), loadStory: vi.fn() });
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/api/library/7/image', '/api/library/9/image']);
    expect(screen.getAllByRole('link', { name: /apri/i })[0]).toHaveAttribute('href', '/api/library/7/image');
    expect(screen.queryByRole('button', { name: /copione/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'a robot, golden hour' })).toBeInTheDocument();
  });
});
