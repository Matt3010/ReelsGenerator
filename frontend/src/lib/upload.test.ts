import { describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, photoProblem, uploadPhoto } from './upload';

const png = (bytes = 10, name = 'mine.png', type = 'image/png') => new File([new Uint8Array(bytes)], name, { type });
const SIGNED = { key: 'k-1', url: '/reels-uploads', fields: { key: 'k-1', Policy: 'p', 'X-Amz-Signature': 's' } };

describe('photoProblem', () => {
  it('takes JPG, PNG and WebP up to the limit, even when the phone does not say the type', () => {
    expect(photoProblem(png())).toBeNull();
    expect(photoProblem(png(10, 'shot.jpeg', ''))).toBeNull();
    expect(photoProblem(png(10, 'notes.txt', 'text/plain'))).toMatch(/JPG, PNG o WebP/);
    expect(photoProblem(png(MAX_PHOTO_BYTES + 1))).toMatch(/troppo grande/);
  });
});

describe('uploadPhoto', () => {
  it('posts the signed form straight to silo, the file last, and gives back its key', async () => {
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const file = png();
    expect(await uploadPhoto(file, async () => SIGNED, post)).toBe('k-1');
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/reels-uploads');
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(['key', 'Policy', 'X-Amz-Signature', 'Content-Type', 'file']);
    expect(form.get('Content-Type')).toBe('image/png');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('says so when silo refuses, and checks the file before asking for anything', async () => {
    await expect(uploadPhoto(png(), async () => SIGNED, async () => new Response(null, { status: 403 }))).rejects.toThrow(/non è riuscito/);
    const ask = vi.fn();
    await expect(uploadPhoto(png(10, 'a.gif', 'image/gif'), ask)).rejects.toThrow(/JPG, PNG o WebP/);
    expect(ask).not.toHaveBeenCalled();
  });
});
