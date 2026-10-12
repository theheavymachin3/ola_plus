import { describe, expect, it } from 'vitest';
import type { FixtureInst, Profile } from '../fixtures/model';
import { buildScale, formatChannelList, groupChannels, parseChannelList, type Group } from './model';

const profile = (n: number): Profile => ({
  id: `p${n}`,
  manufacturer: '',
  name: `${n}ch`,
  source: 'custom',
  modes: [{ name: 'm', channels: Array.from({ length: n }, (_, i) => ({ name: `c${i}`, type: 'Other' })) }],
});
const profiles = new Map([profile(3), profile(4)].map((p) => [p.id, p]));
const lookup = (id: string) => profiles.get(id);
const fx = (id: string, p: number, universe: number, address: number): FixtureInst => ({
  id, name: id, profileId: `p${p}`, mode: 0, universe, address,
});
const group = (over: Partial<Group> = {}): Group => ({
  id: 'g', name: 'G', universe: 1, fixtureIds: [], channels: [], ...over,
});

describe('groupChannels', () => {
  const rig = [fx('a', 3, 1, 1), fx('b', 4, 1, 10), fx('c', 3, 2, 1)];
  it('follows fixtures to their addresses (0-based)', () => {
    expect(groupChannels(group({ fixtureIds: ['a', 'b'] }), rig, lookup)).toEqual([0, 1, 2, 9, 10, 11, 12]);
  });
  it('adds raw channels and removes duplicates', () => {
    expect(groupChannels(group({ fixtureIds: ['a'], channels: [1, 50] }), rig, lookup)).toEqual([0, 1, 2, 50]);
  });
  it('ignores fixtures that were deleted or are on another universe', () => {
    expect(groupChannels(group({ fixtureIds: ['gone', 'c'] }), rig, lookup)).toEqual([]);
  });
  it('re-addressing a fixture moves the group with it', () => {
    const moved = [fx('a', 3, 1, 100)];
    expect(groupChannels(group({ fixtureIds: ['a'] }), moved, lookup)).toEqual([99, 100, 101]);
  });
  it('drops channels outside the universe', () => {
    expect(groupChannels(group({ channels: [-1, 511, 512] }), [], lookup)).toEqual([511]);
  });
});

describe('buildScale', () => {
  const rig = [fx('a', 3, 1, 1)];
  it('is empty when every group is at full', () => {
    expect(buildScale([group({ fixtureIds: ['a'] })], {}, 1, rig, lookup).size).toBe(0);
    expect(buildScale([group({ fixtureIds: ['a'] })], { g: 100 }, 1, rig, lookup).size).toBe(0);
  });
  it('scales a group\'s channels', () => {
    const s = buildScale([group({ fixtureIds: ['a'] })], { g: 50 }, 1, rig, lookup);
    expect([...s]).toEqual([[0, 0.5], [1, 0.5], [2, 0.5]]);
  });
  it('multiplies when a channel is in two groups', () => {
    const groups = [group({ id: 'x', channels: [0] }), group({ id: 'y', channels: [0, 1] })];
    const s = buildScale(groups, { x: 50, y: 50 }, 1, [], lookup);
    expect(s.get(0)).toBe(0.25);
    expect(s.get(1)).toBe(0.5);
  });
  it('only considers groups on the given universe and clamps levels', () => {
    const groups = [group({ id: 'x', universe: 2, channels: [0] }), group({ id: 'y', channels: [5] })];
    const s = buildScale(groups, { x: 0, y: -20 }, 1, [], lookup);
    expect(s.has(0)).toBe(false);
    expect(s.get(5)).toBe(0);
  });
});

describe('parseChannelList / formatChannelList', () => {
  it('parses singles and ranges, 1-based to 0-based', () => {
    expect(parseChannelList('1-3, 7  10;12')).toEqual({ channels: [0, 1, 2, 6, 9, 11] });
    expect(parseChannelList('')).toEqual({ channels: [] });
  });
  it('rejects nonsense with a message', () => {
    expect(parseChannelList('1-3, abc')).toHaveProperty('error');
    expect(parseChannelList('0')).toHaveProperty('error');
    expect(parseChannelList('1-513')).toHaveProperty('error');
    expect(parseChannelList('9-3')).toHaveProperty('error');
  });
  it('round-trips', () => {
    expect(formatChannelList([0, 1, 2, 6, 9, 10])).toBe('1-3, 7, 10-11');
    const text = '1-16, 20, 33-36';
    const parsed = parseChannelList(text);
    expect('channels' in parsed && formatChannelList(parsed.channels)).toBe(text);
  });
});
