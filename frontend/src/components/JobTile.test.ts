import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JobInfo } from '../lib/api';
import { OPTIONS } from '../test/fixtures';
import JobTile from './JobTile.svelte';

const base: JobInfo = {
  id: '20261109-104755-a5b477', topic: 'Cruise ship pianist rescued', voice: 'en-US-GuyNeural', captions: true, news: null,
  state: 'done', step: 'Fatto', title: 'Pianist rescued', error: null, created: 1, options: OPTIONS, duration: 26.2,
};

describe('JobTile', () => {
  it('is a square with a frame of the finished video, named by its title, and opens it', async () => {
    const onopen = vi.fn();
    const { container } = render(JobTile, { job: base, onopen });
    expect(container.querySelector('video')).toHaveAttribute('src', `/api/jobs/${base.id}/video#t=1`);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pianist rescued' }));
    expect(onopen).toHaveBeenCalledWith(base);
  });

  it('marks a job at work with a sign in the corner only, the step said to screen readers', () => {
    const { container } = render(JobTile, { job: { ...base, state: 'running', step: "Disegno l'immagine 3/8", title: null }, onopen: vi.fn() });
    expect(screen.getByRole('button', { name: "Cruise ship pianist rescued · Disegno l'immagine 3/8" })).toBeInTheDocument();
    expect(container.querySelector('.segno')).toBeInTheDocument();
    expect(container.textContent?.trim()).toBe('');
  });

  it('says a job failed, without pulling the page anywhere', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { container } = render(JobTile, { job: { ...base, state: 'error', error: 'boom' }, onopen: vi.fn() });
    expect(screen.getByRole('button', { name: 'Pianist rescued · Errore' })).toBeInTheDocument();
    expect(container.textContent?.trim()).toBe('');
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });
});
