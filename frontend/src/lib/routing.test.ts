import { describe, expect, it } from 'vitest';
import { PHOTOS_PATH, VIDEO_PATH, canonical, readRoute } from './routing';

describe('routing', () => {
  it('knows the two pages', () => {
    expect(readRoute('/')).toEqual({ kind: 'video' });
    expect(readRoute('/immagini')).toEqual({ kind: 'photos' });
    expect(readRoute('/immagini/')).toEqual({ kind: 'photos' });
  });

  it('takes anything else home', () => {
    expect(readRoute('/nope')).toEqual({ kind: 'video' });
    expect(readRoute('/immagini/7')).toEqual({ kind: 'video' });
  });

  it('writes every address one way', () => {
    expect(canonical('/immagini/')).toBe(PHOTOS_PATH);
    expect(canonical('/whatever')).toBe(VIDEO_PATH);
  });
});
