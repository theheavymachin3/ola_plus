import { describe, expect, it } from 'vitest';
import { findConflicts, fitsUniverse, formatRange, nextFreeAddress, occupancy, sequentialAddresses } from './addressing';
import type { FixtureInst, Profile } from './model';

const mk = (n: number): Profile => ({
  id: `p${n}`,
  manufacturer: '',
  name: `${n}ch`,
  source: 'custom',
  modes: [{ name: 'm', channels: Array.from({ length: n }, (_, i) => ({ name: `c${i}`, type: 'Other' })) }],
});
const profiles = new Map([3, 4, 16].map((n) => [`p${n}`, mk(n)]));
const lookup = (id: string) => profiles.get(id);
const fx = (id: string, p: number, universe: number, address: number): FixtureInst => ({
  id, name: id, profileId: `p${p}`, mode: 0, universe, address,
});

describe('findConflicts', () => {
  it('is empty when fixtures sit back to back', () => {
    expect(findConflicts([fx('a', 3, 1, 1), fx('b', 3, 1, 4)], lookup).size).toBe(0);
  });
  it('flags both fixtures of an overlap', () => {
    const bad = findConflicts([fx('a', 4, 1, 1), fx('b', 3, 1, 4)], lookup);
    expect([...bad].sort()).toEqual(['a', 'b']);
  });
  it('ignores overlaps across different universes', () => {
    expect(findConflicts([fx('a', 4, 1, 1), fx('b', 4, 2, 1)], lookup).size).toBe(0);
  });
  it('catches a long fixture covering several later ones', () => {
    const bad = findConflicts([fx('big', 16, 1, 1), fx('x', 3, 1, 5), fx('y', 3, 1, 9)], lookup);
    expect([...bad].sort()).toEqual(['big', 'x', 'y']);
  });
  it('flags a fixture running past 512', () => {
    expect(findConflicts([fx('a', 4, 1, 510)], lookup).has('a')).toBe(true);
    expect(findConflicts([fx('a', 4, 1, 509)], lookup).has('a')).toBe(false);
  });
});

describe('occupancy / nextFreeAddress', () => {
  const rig = [fx('a', 3, 1, 1), fx('b', 3, 1, 7)];
  it('maps slots to fixtures', () => {
    const o = occupancy(rig, 1, lookup);
    expect(o.get(1)).toEqual(['a']);
    expect(o.get(4)).toBeUndefined();
    expect(o.get(9)).toEqual(['b']);
  });
  it('finds the first gap that fits', () => {
    expect(nextFreeAddress(rig, 1, 3, lookup)).toBe(4);
    expect(nextFreeAddress(rig, 1, 4, lookup)).toBe(10);
    expect(nextFreeAddress(rig, 2, 4, lookup)).toBe(1);
  });
  it('honours the start hint and returns null when nothing fits', () => {
    expect(nextFreeAddress(rig, 1, 3, lookup, 5)).toBe(10);
    expect(nextFreeAddress([fx('a', 16, 1, 1)], 1, 512, lookup)).toBeNull();
  });
});

describe('sequentialAddresses', () => {
  it('lays fixtures out back to back', () => {
    expect(sequentialAddresses(1, 4, 3)).toEqual([1, 5, 9]);
    expect(sequentialAddresses(1, 4, 3, 2)).toEqual([1, 7, 13]);
  });
  it('stops when the universe is full', () => {
    expect(sequentialAddresses(505, 4, 5)).toEqual([505, 509]);
  });
});

describe('helpers', () => {
  it('fitsUniverse / formatRange', () => {
    expect(fitsUniverse(509, 4)).toBe(true);
    expect(fitsUniverse(510, 4)).toBe(false);
    expect(formatRange({ first: 5, last: 5 })).toBe('5');
    expect(formatRange({ first: 5, last: 8 })).toBe('5–8');
  });
});
