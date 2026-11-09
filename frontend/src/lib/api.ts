/* The API behind nginx's /api: news, jobs, their scripts and videos. */
import type { SignedUpload } from './upload';

export interface NewsItem { title: string; url: string; published: string; outlet: string; summary: string }

/** lo stile delle immagini, il modello che le disegna e quali limiti valgono: per video e immagini */
export interface JobOptions { style: string; realPeople: boolean; avoid: boolean; model?: string }
/** un modello di immagini; `negative`: se ascolta il negative prompt */
export interface ImageModel {
  id: string; label: string; note: string; negative: boolean;
  /** quanto ci mette più o meno un'immagine, per risoluzione */
  minutes: Record<Resolution, number>;
}
/** gli stili e i modelli che il server sa usare e le scelte con cui parte un lavoro: li decide lui */
export interface Palette { styles: { id: string; label: string }[]; defaults: JobOptions; models: ImageModel[] }

export interface NewJob { topic: string; voice: string; captions: boolean; news: NewsItem | null; options: JobOptions }

/** un'immagine: il prompt e il negative prompt come scritti, quante, in che formato, e da che seed (null: a caso) */
export type Format = 'portrait' | 'square' | 'landscape';
/** oltre la misura del modello: disegnata e poi ingrandita (lato lungo 1920 o 3840) */
export type Resolution = 'standard' | 'fullhd' | '4k';
export interface PhotoRequest {
  prompt: string; negative: string; count: number; format: Format; seed: number | null; resolution: Resolution; model?: string;
  /** partire da una foto propria: la sua chiave in silo, e quanto cambiarla (0,1-0,95) */
  init?: { key: string; strength: number; url?: string };
}
/** cos'è un'immagine della libreria: il seed per rifarla, la misura, il modello che l'ha disegnata */
export interface PictureInfo { id: number; prompt: string; seed: number; width: number; height: number; model: string }

export interface JobInfo extends NewJob {
  kind?: 'video' | 'photo';
  photo?: PhotoRequest;
  /** le immagini, ognuna con il suo link firmato (silo) */
  images?: { id: number; url: string }[];
  /** un video finito: i link firmati per guardarlo e per scaricarlo col suo nome */
  video?: { url: string; download: string };
  id: string;
  state: 'queued' | 'running' | 'done' | 'error';
  step: string;
  title: string | null;
  error: string | null;
  created: number;
  duration?: number;
  /** quando è partito e quando ha finito il lavoro (secondi, come created) */
  started?: number;
  finished?: number;
  /** sotto il passo: a che punto è il modello («passo 3/8 · 2.51 s/it») */
  detail?: string;
}

/** quanto lavora la macchina (come htop): memorie in MiB, cpu di un processo 100 = un core pieno */
export interface Stats {
  gpu: { name: string; util: number; memUsed: number; memTotal: number; power: number; temp: number } | null;
  cpu: number; cores: number; mem: { used: number; total: number };
  procs: { pid: number; name: string; cpu: number; mem: number }[];
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
  /** un modulo firmato per mandare una foto direttamente a silo */
  uploads: () => call<SignedUpload>('/api/uploads', { method: 'POST' }),
  photos: (req: PhotoRequest) => call<{ id: string }>('/api/photos', { method: 'POST', body: JSON.stringify(req) }),
};

