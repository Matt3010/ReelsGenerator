import { describe, expect, it, vi } from 'vitest';
import { OPTIONS as options } from '../test/fixtures';
import { api, imageUrl, videoUrl } from './api';

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('api', () => {
  it('lists jobs, news and voices', async () => {
    const fetcher = reply([{ id: 'a' }]);
    vi.stubGlobal('fetch', fetcher);
    expect(await api.jobs()).toEqual([{ id: 'a' }]);
    expect(fetcher).toHaveBeenCalledWith('/api/jobs', expect.anything());
    await api.news();
    expect(fetcher).toHaveBeenLastCalledWith('/api/news', expect.anything());
    await api.voices();
    expect(fetcher).toHaveBeenLastCalledWith('/api/voices', expect.anything());
    await api.styles();
    expect(fetcher).toHaveBeenLastCalledWith('/api/styles', expect.anything());
  });

  it('creates a job with its news source', async () => {
    const fetcher = reply({ id: 'j1' });
    vi.stubGlobal('fetch', fetcher);
    const news = { title: 'T', url: 'https://bbc.co.uk/a', published: '', outlet: 'BBC News', summary: '' };
    expect(await api.create({ topic: 'T', voice: 'en-US-GuyNeural', captions: true, news, options })).toEqual({ id: 'j1' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/jobs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ topic: 'T', voice: 'en-US-GuyNeural', captions: true, news, options });
  });

  it('retries a job and reads its script', async () => {
    const fetcher = reply({ id: 'j1' });
    vi.stubGlobal('fetch', fetcher);
    await api.retry('j1');
    expect(fetcher).toHaveBeenLastCalledWith('/api/jobs/j1/retry', expect.objectContaining({ method: 'POST' }));
    await api.story('j1');
    expect(fetcher).toHaveBeenLastCalledWith('/api/jobs/j1/story', expect.anything());
  });

  it("fails with the server's own words", async () => {
    vi.stubGlobal('fetch', reply({ detail: 'topic is empty' }, 422));
    await expect(api.create({ topic: '', voice: 'v', captions: true, news: null, options })).rejects.toThrow('topic is empty');
  });

  it('points at the video', () => expect(videoUrl('j1')).toBe('/api/jobs/j1/video'));
});

describe('api for pictures', () => {
  it('asks for pictures and points at them', async () => {
    const fetcher = reply({ id: 'p1' });
    vi.stubGlobal('fetch', fetcher);
    await api.photos({ prompt: 'a cat', negative: 'dogs', count: 1, format: 'square', seed: 7, resolution: '4k' });
    const [url, init] = fetcher.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(url).toBe('/api/photos');
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'a cat', negative: 'dogs', count: 1, format: 'square', seed: 7, resolution: '4k' });
    expect(imageUrl(7)).toBe('/api/library/7/image');
    await api.remove('j1');
    expect(fetcher).toHaveBeenLastCalledWith('/api/jobs/j1', expect.objectContaining({ method: 'DELETE' }));
    await api.picture(7);
    expect(fetcher).toHaveBeenLastCalledWith('/api/library/7', expect.anything());
    await api.removePicture(7);
    expect(fetcher).toHaveBeenLastCalledWith('/api/library/7', expect.objectContaining({ method: 'DELETE' }));
  });
});
