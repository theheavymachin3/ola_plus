import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('returns v4-shaped ids that differ', () => {
    const a = newId();
    expect(a).toMatch(UUID);
    expect(newId()).not.toBe(a);
  });

  it('still works where randomUUID is missing (plain http contexts)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(newId()).toMatch(UUID);
  });

  it('still works with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newId()).toMatch(UUID);
  });
});
