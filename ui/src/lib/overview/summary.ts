// Pure summaries for the Overview page: what is on each universe and device, how busy it is,
// and the short list of things worth the operator's attention. No I/O.
import type { PluginSummary } from '../api';
import type { FixtureInst } from '../fixtures/model';
import type { Group } from '../groups/model';
import { groupByDevice, portsOf, type DeviceGroup, type Port, type Universe } from '../patchModel';
import type { Scene } from '../scenes/model';
import type { SyncStatus } from '../sync/docSync';

export interface UniverseOverview {
  universe: Universe;
  inputs: Port[];
  outputs: Port[];
  fixtures: number;
  scenes: number;
  groups: number;
}

export function universeOverviews(
  universes: Universe[],
  ports: Port[],
  fixtures: FixtureInst[],
  scenes: Scene[],
  groups: Group[],
): UniverseOverview[] {
  return universes.map((universe) => ({
    universe,
    inputs: portsOf(ports, universe.id, false),
    outputs: portsOf(ports, universe.id, true),
    fixtures: fixtures.filter((f) => f.universe === universe.id).length,
    scenes: scenes.filter((s) => s.universe === universe.id).length,
    groups: groups.filter((g) => g.universe === universe.id).length,
  }));
}

export interface DeviceOverview extends DeviceGroup {
  patched: number;
  total: number;
}

export function deviceOverviews(ports: Port[]): DeviceOverview[] {
  return groupByDevice(ports).map((d) => {
    const all = [...d.inputs, ...d.outputs];
    return { ...d, total: all.length, patched: all.filter((p) => p.universe !== null).length };
  });
}

/** How many channels are above zero and the highest value, for a DMX snapshot. */
export function activity(dmx: ArrayLike<number> | undefined): { active: number; peak: number } {
  let active = 0;
  let peak = 0;
  if (dmx) {
    for (let i = 0; i < dmx.length; i++) {
      const v = dmx[i];
      if (v > 0) active++;
      if (v > peak) peak = v;
    }
  }
  return { active, peak };
}

export type Goto = 'routing' | 'patch' | 'plugins';
export interface Notice {
  severity: 'warn' | 'info';
  text: string;
  goto?: Goto;
}

export interface NoticeInput {
  reachable: boolean;
  universes: UniverseOverview[];
  fixtureConflicts: number;
  plugins: PluginSummary[];
  sync: SyncStatus;
  patchLimited: boolean;
}

export function buildNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  if (!i.reachable) {
    return [{ severity: 'warn', text: 'Cannot reach olad. What is shown may be out of date.' }];
  }
  if (i.fixtureConflicts > 0) {
    out.push({
      severity: 'warn',
      text: `${i.fixtureConflicts} fixture${i.fixtureConflicts === 1 ? '' : 's'} overlap on the same DMX addresses.`,
      goto: 'patch',
    });
  }
  for (const u of i.universes) {
    if (u.outputs.length === 0) {
      out.push({
        severity: 'warn',
        text: `U${u.universe.id} has no output: nothing physical receives it.`,
        goto: 'routing',
      });
    }
    if (u.inputs.length > 1) {
      out.push({
        severity: 'info',
        text: `U${u.universe.id} merges ${u.inputs.length} inputs (${u.universe.mergeMode}).`,
        goto: 'routing',
      });
    }
  }
  const idle = i.plugins.filter((p) => p.enabled && !p.active);
  if (idle.length > 0) {
    out.push({
      severity: 'info',
      text: `${idle.length} plugin${idle.length === 1 ? ' is' : 's are'} enabled but not running: ${idle
        .map((p) => p.name)
        .join(', ')}.`,
      goto: 'plugins',
    });
  }
  if (i.sync === 'offline') {
    out.push({ severity: 'warn', text: 'Fixtures, scenes and groups are not being saved: olad is unreachable.' });
  } else if (i.sync === 'local') {
    out.push({
      severity: 'info',
      text: 'Fixtures, scenes and groups are kept in this browser only (this olad has no shared storage).',
    });
  }
  if (i.patchLimited) {
    out.push({
      severity: 'info',
      text: 'This olad lists only some free ports; the patch view may not show every device port.',
      goto: 'routing',
    });
  }
  return out;
}
