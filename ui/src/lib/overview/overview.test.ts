import { describe, expect, it } from 'vitest';
import { changedChannels, columnsFor, formatValue, heat, ownerOf } from '../monitor/cells';
import type { FixtureInst, Profile } from '../fixtures/model';
import type { Port, Universe } from '../patchModel';
import { activity, buildNotices, deviceOverviews, universeOverviews, type NoticeInput } from './summary';

const port = (id: string, universe: number | null, device = 'Dev'): Port => ({
  id,
  alias: Number(id.split('-')[0]),
  device,
  description: '',
  isOutput: id.includes('-O-'),
  universe,
  priority: null,
});
const uni = (id: number, mergeMode: 'HTP' | 'LTP' = 'HTP'): Universe => ({ id, name: `U${id}`, mergeMode });

describe('universeOverviews / deviceOverviews', () => {
  const ports = [port('1-I-0', 1), port('1-O-0', 1), port('2-O-0', null, 'Other'), port('2-O-1', 1, 'Other')];
  it('splits inputs and outputs and counts what lives on a universe', () => {
    const [u1] = universeOverviews([uni(1)], ports, [{ universe: 1 } as FixtureInst, { universe: 2 } as FixtureInst], [], []);
    expect(u1.inputs.map((p) => p.id)).toEqual(['1-I-0']);
    expect(u1.outputs.map((p) => p.id)).toEqual(['1-O-0', '2-O-1']);
    expect(u1.fixtures).toBe(1);
  });
  it('counts patched ports per device', () => {
    const d = deviceOverviews(ports);
    expect(d.map((x) => [x.alias, x.patched, x.total])).toEqual([[1, 2, 2], [2, 1, 2]]);
  });
});

describe('activity', () => {
  it('counts lit channels and the peak', () => {
    expect(activity([0, 5, 0, 200, 1])).toEqual({ active: 3, peak: 200 });
    expect(activity(undefined)).toEqual({ active: 0, peak: 0 });
  });
});

describe('buildNotices', () => {
  const base = (over: Partial<NoticeInput> = {}): NoticeInput => ({
    reachable: true,
    universes: universeOverviews([uni(1)], [port('1-I-0', 1), port('2-O-0', 1)], [], [], []),
    fixtureConflicts: 0,
    plugins: [],
    sync: 'synced',
    patchLimited: false,
    ...over,
  });
  it('is quiet when all is well', () => {
    expect(buildNotices(base())).toEqual([]);
  });
  it('only reports the lost connection when olad is unreachable', () => {
    const n = buildNotices(base({ reachable: false, fixtureConflicts: 3 }));
    expect(n).toHaveLength(1);
    expect(n[0].severity).toBe('warn');
  });
  it('flags overlaps, a universe nobody listens to, merged inputs and idle plugins', () => {
    const universes = universeOverviews([uni(1), uni(2, 'LTP')], [port('1-I-0', 1), port('3-I-0', 2), port('3-I-1', 2), port('4-O-0', 2)], [], [], []);
    const n = buildNotices(
      base({
        fixtureConflicts: 2,
        universes,
        plugins: [
          { id: 1, name: 'Dummy', active: true, enabled: true },
          { id: 2, name: 'Open DMX', active: false, enabled: true },
          { id: 3, name: 'Off', active: false, enabled: false },
        ],
      }),
    );
    const text = n.map((x) => x.text).join(' | ');
    expect(text).toContain('2 fixtures overlap');
    expect(text).toContain('U1 has no output');
    expect(text).toContain('U2 merges 2 inputs (LTP)');
    expect(text).toContain('1 plugin is enabled but not running: Open DMX');
    expect(text).not.toContain('Off');
  });
  it('explains where fixtures and scenes are kept when not shared', () => {
    expect(buildNotices(base({ sync: 'local' }))[0].text).toContain('this browser only');
    expect(buildNotices(base({ sync: 'offline' }))[0].severity).toBe('warn');
  });
});

describe('monitor cells', () => {
  it('formats values in three bases and clamps', () => {
    expect(formatValue(255, 'dec')).toBe('255');
    expect(formatValue(255, 'pct')).toBe('100');
    expect(formatValue(128, 'pct')).toBe('50');
    expect(formatValue(10, 'hex')).toBe('0A');
    expect(formatValue(999, 'hex')).toBe('FF');
    expect(formatValue(-5, 'dec')).toBe('0');
  });
  it('heat is zero only for zero and increases', () => {
    expect(heat(0)).toBe(0);
    expect(heat(1)).toBeGreaterThan(0.1);
    expect(heat(255)).toBe(1);
    expect(heat(100)).toBeLessThan(heat(200));
  });
  it('picks a column count that divides 512', () => {
    for (const w of [300, 400, 600, 1000, 1600]) expect(512 % columnsFor(w)).toBe(0);
    expect(columnsFor(1200)).toBe(32);
    expect(columnsFor(360)).toBe(8);
  });
  it('finds the fixture and channel name behind a channel', () => {
    const profile: Profile = {
      id: 'p', manufacturer: '', name: 'RGB', source: 'custom',
      modes: [{ name: 'm', channels: [{ name: 'Red', type: 'ColorIntensity' }, { name: 'Green', type: 'ColorIntensity' }, { name: 'Blue', type: 'ColorIntensity' }] }],
    };
    const lookup = (id: string) => (id === 'p' ? profile : undefined);
    const fx: FixtureInst[] = [{ id: 'a', name: 'Par 1', profileId: 'p', mode: 0, universe: 1, address: 10 }];
    expect(ownerOf(10, 1, fx, lookup)).toMatchObject({ channelName: 'Green', fixture: { name: 'Par 1' } }); // slot 11
    expect(ownerOf(9, 1, fx, lookup)?.channelName).toBe('Red');
    expect(ownerOf(12, 1, fx, lookup)).toBeNull();
    expect(ownerOf(10, 2, fx, lookup)).toBeNull();
  });
  it('lists changed channels', () => {
    expect(changedChannels(null, [1, 2])).toEqual([]);
    expect(changedChannels([1, 2, 3], [1, 5, 0])).toEqual([1, 2]);
  });
});
