import { describe, expect, it } from 'vitest';
import type { PatchOverview, RawPort, RawUniverseInfo } from './api';
import { buildModel, buildModelFromOverview, groupByDevice, nextFreeUniverse, universeWarnings, portsOf } from './patchModel';

const port = (id: string, device = 'Dev', extra: Partial<RawPort> = {}): RawPort => ({
  device,
  description: 'd',
  id,
  is_output: id.includes('-O-'),
  priority: {},
  ...extra,
});

const uni = (id: number, ins: RawPort[], outs: RawPort[]): RawUniverseInfo => ({
  id,
  name: `U${id}`,
  merge_mode: 'HTP',
  input_ports: ins,
  output_ports: outs,
});

describe('buildModel', () => {
  it('assigns the universe to patched ports and null to free ones', () => {
    const m = buildModel([uni(1, [], [port('2-O-1')])], [port('3-O-1')]);
    expect(m.ports.find((p) => p.id === '2-O-1')?.universe).toBe(1);
    expect(m.ports.find((p) => p.id === '3-O-1')?.universe).toBeNull();
  });

  it('does not let a free-port entry override a patched one', () => {
    const m = buildModel([uni(1, [], [port('2-O-1')])], [port('2-O-1')]);
    expect(m.ports).toHaveLength(1);
    expect(m.ports[0].universe).toBe(1);
  });

  it('sorts ports by device then port number numerically', () => {
    const m = buildModel([], [port('2-O-10'), port('2-O-2'), port('1-O-1')]);
    expect(m.ports.map((p) => p.id)).toEqual(['1-O-1', '2-O-2', '2-O-10']);
  });

  it('reads priority only when the port supports it', () => {
    const none = buildModel([], [port('1-O-1')]).ports[0];
    const full = buildModel(
      [],
      [port('1-O-2', 'D', { priority: { value: 50, current_mode: 'inherit', priority_capability: 'full' } })],
    ).ports[0];
    expect(none.priority).toBeNull();
    expect(full.priority).toEqual({ mode: 'inherit', value: 50, capability: 'full' });
  });
});

describe('buildModelFromOverview', () => {
  const overview: PatchOverview = {
    devices: [
      {
        alias: 4,
        name: 'ArtNet',
        plugin_id: 2,
        ports: [
          { ...port('4-I-0'), universe: 1 },
          { ...port('4-I-1'), universe: null },
          { ...port('4-O-0'), universe: null },
        ],
      },
      { alias: 1, name: 'Dummy', plugin_id: 1, ports: [{ ...port('1-O-0', 'Dummy'), universe: 2 }] },
    ],
    universes: [
      { id: 2, name: 'B', merge_mode: 'LTP' },
      { id: 1, name: 'A', merge_mode: 'HTP' },
    ],
  };
  const m = buildModelFromOverview(overview);

  it('keeps every port, including free ones beyond the first', () => {
    expect(m.ports.map((p) => p.id)).toEqual(['1-O-0', '4-I-0', '4-O-0', '4-I-1']);
  });
  it('maps universe or null per port', () => {
    expect(m.ports.map((p) => p.universe)).toEqual([2, 1, null, null]);
  });
  it('sorts universes and keeps merge mode', () => {
    expect(m.universes).toEqual([
      { id: 1, name: 'A', mergeMode: 'HTP' },
      { id: 2, name: 'B', mergeMode: 'LTP' },
    ]);
  });
});

describe('groupByDevice', () => {
  it('splits inputs and outputs per device', () => {
    const m = buildModel([], [port('1-I-1'), port('1-O-1'), port('2-O-1')]);
    const g = groupByDevice(m.ports);
    expect(g).toHaveLength(2);
    expect(g[0].inputs).toHaveLength(1);
    expect(g[0].outputs).toHaveLength(1);
  });
});

describe('nextFreeUniverse', () => {
  it('fills the first gap', () => {
    const u = (id: number) => ({ id, name: '', mergeMode: 'HTP' as const });
    expect(nextFreeUniverse([])).toBe(1);
    expect(nextFreeUniverse([u(1), u(2), u(4)])).toBe(3);
  });
});

describe('universeWarnings', () => {
  it('flags merged inputs and missing outputs', () => {
    const m = buildModel([uni(1, [port('1-I-1'), port('1-I-2')], [])], []);
    const w = universeWarnings(m.universes[0], m.ports);
    expect(w).toHaveLength(2);
    expect(portsOf(m.ports, 1, false)).toHaveLength(2);
  });

  it('is quiet for a simple in->out universe', () => {
    const m = buildModel([uni(1, [port('1-I-1')], [port('2-O-1')])], []);
    expect(universeWarnings(m.universes[0], m.ports)).toEqual([]);
  });
});
