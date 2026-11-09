/* The API behind nginx's /api: news, jobs, their scripts and videos. */

export interface NewsItem { title: string; url: string; published: string; outlet: string; summary: string }

export interface NewJob { topic: string; voice: string; captions: boolean; news: NewsItem | null }

export type TagSet = Record<string, string[]>;
export interface PhotoRequest { tags: TagSet; extra: string; count: number }
export interface TagSuggestions { categories: { id: string; label: string; tags: string[] }[]; recent: TagSet[] }

export interface JobInfo extends NewJob {
  kind?: 'video' | 'photo';
  photo?: PhotoRequest;
  images?: number[];
  id: string;
  state: 'queued' | 'running' | 'done' | 'error';
  step: string;
  title: string | null;
  error: string | null;
  created: number;
  duration?: number;
}

export interface Story { title?: string; scenes: { narration: string }[] }

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `HTTP ${r.status}`);
  return body as T;
}

export const api = {
  voices: () => call<Record<string, string>>('/api/voices'),
  news: () => call<NewsItem[]>('/api/news'),
  jobs: () => call<JobInfo[]>('/api/jobs'),
  create: (job: NewJob) => call<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(job) }),
  retry: (id: string) => call<{ id: string }>(`/api/jobs/${id}/retry`, { method: 'POST' }),
  story: (id: string) => call<Story>(`/api/jobs/${id}/story`),
  tags: () => call<TagSuggestions>('/api/tags'),
  photos: (req: PhotoRequest) => call<{ id: string }>('/api/photos', { method: 'POST', body: JSON.stringify(req) }),
};

export const videoUrl = (id: string) => `/api/jobs/${id}/video`;
export const imageUrl = (id: number) => `/api/library/${id}/image`;
