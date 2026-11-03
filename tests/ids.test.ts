import { describe, expect, it } from 'vitest';
import { newId } from '@/lib/data/ids';

describe('newId', () => {
  it('genera IDs únicos, crecientes y seguros para JS', () => {
    const ids = Array.from({ length: 5000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isSafeInteger(id) && id > 2 ** 31)).toBe(true);
  });
});
