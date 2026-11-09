import { expect, it } from 'vitest';
import { durata } from './tempo';

it('says a span of time the way people say it', () => {
  expect(durata(0)).toBe('0 s');
  expect(durata(45.6)).toBe('45 s');
  expect(durata(192)).toBe('3 min 12 s');
  expect(durata(600)).toBe('10 min');
  expect(durata(3900)).toBe('1 h 5 min');
});
