/* The API behind nginx's /api: news, jobs, their scripts and videos. */

export interface NewsItem { title: string; url: string; published: string; outlet: string; summary: string }

/** lo stile delle immagini e quali limiti valgono: per video e immagini */
export interface JobOptions { style: string; realPeople: boolean; avoid: boolean }
/** gli stili che il server sa disegnare e le scelte con cui parte un lavoro: li decide lui */
export interface Palette { styles: { id: string; label: string }[]; defaults: JobOptions }

export interface NewJob { topic: string; voice: string; captions: boolean; news: NewsItem | null; options: JobOptions }

/** un'immagine: il prompt e il negative prompt come scritti, quante, in che formato, e da che seed (null: a caso) */
export type Format = 'portrait' | 'square' | 'landscape';
export interface PhotoRequest { prompt: string; negative: string; count: number; format: Format; seed: number | null }
/** cos'è un'immagine della libreria: il seed per rifarla, la misura */
export interface PictureInfo { id: number; prompt: string; seed: number; width: number; height: number }

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
  styles: () => call<Palette>('/api/styles'),
  news: () => call<NewsItem[]>('/api/news'),
  jobs: () => call<JobInfo[]>('/api/jobs'),
  create: (job: NewJob) => call<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(job) }),
  retry: (id: string) => call<{ id: string }>(`/api/jobs/${id}/retry`, { method: 'POST' }),
  story: (id: string) => call<Story>(`/api/jobs/${id}/story`),
  remove: (id: string) => call<{ ok: true }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  picture: (id: number) => call<PictureInfo>(`/api/library/${id}`),
  removePicture: (id: number) => call<{ ok: true }>(`/api/library/${id}`, { method: 'DELETE' }),
  photos: (req: PhotoRequest) => call<{ id: string }>('/api/photos', { method: 'POST', body: JSON.stringify(req) }),
};

export const videoUrl = (id: string) => `/api/jobs/${id}/video`;
export const imageUrl = (id: number) => `/api/library/${id}/image`;
