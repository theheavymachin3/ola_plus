import { describe, expect, it } from 'vitest';
import {
  byAddress,
  compareUid,
  newDevice,
  overlapping,
  planSequential,
  spanOf,
  validateAddress,
  type RdmDevice,
} from './model';
import { SerialQueue } from './queue';

const dev = (uid: string, address: number | null, footprint: number | null): RdmDevice => ({
  ...newDevice(uid),
  address,
  footprint,
});

describe('validateAddress', () => {
  it('accepts 1..512 and checks the footprint fits', () => {
    expect(validateAddress(1, 10)).toBeNull();
    expect(validateAddress(503, 10)).toBeNull();
    expect(validateAddress(504, 10)).toMatch(/last address that fits is 503/);
    expect(validateAddress(0, 1)).not.toBeNull();
    expect(validateAddress(513, null)).not.toBeNull();
    expect(validateAddress(1.5, 1)).not.toBeNull();
  });
});

describe('spans and overlaps', () => {
  it('computes inclusive ranges', () => {
    expect(spanOf(dev('1:1', 10, 4))).toEqual({ uid: '1:1', start: 10, end: 13 });
    expect(spanOf(dev('1:1', null, 4))).toBeNull();
    expect(spanOf(dev('1:1', 10, 0))).toBeNull();
  });
  it('flags devices that share channels, not those that merely touch', () => {
    const list = [dev('a:1', 1, 10), dev('a:2', 11, 10), dev('a:3', 20, 5), dev('a:4', 100, 4)];
    expect([...overlapping(list)].sort()).toEqual(['a:2', 'a:3']);
  });
  it('catches a long device covering several short ones', () => {
    const list = [dev('a:1', 1, 100), dev('a:2', 10, 1), dev('a:3', 50, 1), dev('a:4', 200, 1)];
    expect([...overlapping(list)].sort()).toEqual(['a:1', 'a:2', 'a:3']);
  });
  it('ignores devices without an address', () => {
    expect(overlapping([dev('a:1', null, 5), dev('a:2', null, 5)]).size).toBe(0);
  });
});

describe('ordering', () => {
  it('compares UIDs numerically in hex', () => {
    expect(compareUid('7a70:0000000a', '7a70:00000009')).toBeGreaterThan(0);
    expect(compareUid('00ff:00000001', '0100:00000001')).toBeLessThan(0);
  });
  it('sorts by address, unknown ones last', () => {
    const order = byAddress([dev('a:3', null, 1), dev('a:2', 20, 1), dev('a:1', 5, 1)]).map((d) => d.uid);
    expect(order).toEqual(['a:1', 'a:2', 'a:3']);
  });
});

describe('planSequential', () => {
  it('lays devices end to end in their current order', () => {
    const list = [dev('a:1', 40, 8), dev('a:2', 1, 4), dev('a:3', 10, 16)];
    const plan = planSequential(list, 1, 0);
    expect(plan.changes).toEqual([
      // a:2 (address 1) is already where it should be, so only the others move
      { uid: 'a:3', from: 10, to: 5 },
      { uid: 'a:1', from: 40, to: 21 },
    ]);
    expect(plan.overflow).toEqual([]);
  });
  it('leaves a gap between devices when asked', () => {
    const plan = planSequential([dev('a:1', 1, 4), dev('a:2', 5, 4)], 1, 2);
    expect(plan.changes).toEqual([{ uid: 'a:2', from: 5, to: 7 }]);
  });
  it('reports devices that would not fit instead of wrapping around', () => {
    const plan = planSequential([dev('a:1', 1, 300), dev('a:2', 301, 300)], 1, 0);
    expect(plan.changes).toEqual([]);
    expect(plan.overflow).toEqual(['a:2']);
  });
  it('skips devices that have no footprint', () => {
    const plan = planSequential([dev('a:1', null, null), dev('a:2', 9, 2)], 1, 0);
    expect(plan.changes).toEqual([{ uid: 'a:2', from: 9, to: 1 }]);
  });
});

describe('SerialQueue', () => {
  it('runs one task at a time, in order, and survives a failure', async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    const slow = (name: string, ms: number, fail = false) =>
      q.run(async () => {
        log.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      });
    const results = await Promise.allSettled([slow('a', 20), slow('b', 1, true), slow('c', 1)]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});
