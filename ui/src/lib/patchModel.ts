// Pure patch logic: turns olad's per-universe / unpatched port lists into one flat
// model the UI can group either way (by universe or by device). No I/O here.
import type { PatchOverview, PriorityMode, RawPort, RawUniverseInfo } from './api';

export interface Port {
  id: string; // "<alias>-<I|O>-<n>"
  alias: number;
  device: string;
  description: string;
  isOutput: boolean;
  universe: number | null; // null = not patched
  priority: { mode: PriorityMode; value: number; capability: 'static' | 'full' } | null;
}

export interface Universe {
  id: number;
  name: string;
  mergeMode: 'HTP' | 'LTP';
}

export interface DeviceGroup {
  alias: number;
  name: string;
  inputs: Port[];
  outputs: Port[];
}

export interface PatchModel {
  universes: Universe[];
  ports: Port[];
}

export function toPort(raw: RawPort, universe: number | null): Port {
  const p = raw.priority;
  const hasPriority = !!p && p.priority_capability !== undefined;
  return {
    id: raw.id,
    alias: Number(raw.id.split('-')[0]),
    device: raw.device,
    description: raw.description,
    isOutput: raw.is_output,
    universe,
    priority: hasPriority
      ? {
          mode: p!.current_mode ?? 'static',
          value: p!.value ?? 100,
          capability: p!.priority_capability!,
        }
      : null,
  };
}

export function buildModel(details: RawUniverseInfo[], free: RawPort[]): PatchModel {
  const ports = new Map<string, Port>();
  const universes: Universe[] = [];
  for (const u of details) {
    universes.push({ id: u.id, name: u.name, mergeMode: u.merge_mode });
    for (const r of [...u.input_ports, ...u.output_ports]) ports.set(r.id, toPort(r, u.id));
  }
  for (const r of free) if (!ports.has(r.id)) ports.set(r.id, toPort(r, null));
  universes.sort((a, b) => a.id - b.id);
  return { universes, ports: [...ports.values()].sort(comparePorts) };
}

/** Same model as buildModel, from the single /json/patch_overview response. */
export function buildModelFromOverview(o: PatchOverview): PatchModel {
  const ports: Port[] = [];
  for (const d of o.devices) {
    for (const raw of d.ports) ports.push(toPort(raw, raw.universe ?? null));
  }
  const universes = o.universes
    .map((u) => ({ id: u.id, name: u.name, mergeMode: u.merge_mode }))
    .sort((a, b) => a.id - b.id);
  return { universes, ports: ports.sort(comparePorts) };
}

function portNumber(id: string): number {
  return Number(id.split('-')[2]);
}

function comparePorts(a: Port, b: Port): number {
  return a.alias - b.alias || portNumber(a.id) - portNumber(b.id);
}

export function groupByDevice(ports: Port[]): DeviceGroup[] {
  const groups = new Map<number, DeviceGroup>();
  for (const p of ports) {
    let g = groups.get(p.alias);
    if (!g) {
      g = { alias: p.alias, name: p.device, inputs: [], outputs: [] };
      groups.set(p.alias, g);
    }
    (p.isOutput ? g.outputs : g.inputs).push(p);
  }
  return [...groups.values()].sort((a, b) => a.alias - b.alias);
}

export function portsOf(ports: Port[], universe: number, isOutput: boolean): Port[] {
  return ports.filter((p) => p.universe === universe && p.isOutput === isOutput);
}

export const MAX_UNIVERSE_ID = 99999;

/**
 * Why a new universe can't be created, or null if it can. olad only keeps a universe that has
 * at least one port, so asking for an empty one always fails there ("Failed to patch any ports").
 */
export function validateNewUniverse(id: number, existingIds: number[], portIds: string[]): string | null {
  if (!Number.isInteger(id) || id < 0 || id > MAX_UNIVERSE_ID) {
    return `The universe number must be a whole number from 0 to ${MAX_UNIVERSE_ID}.`;
  }
  if (existingIds.includes(id)) {
    return `U${id} already exists. Add ports to it from its own card.`;
  }
  if (portIds.length === 0) {
    return 'Pick at least one port: olad only keeps a universe that has a port.';
  }
  return null;
}

// Smallest universe id >= 1 not in use.
export function nextFreeUniverse(universes: Universe[]): number {
  const used = new Set(universes.map((u) => u.id));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function portLabel(p: Port): string {
  return p.description ? `${p.device} · ${p.description}` : p.device;
}

// Plain-language hints about a universe's wiring. Several output ports on one universe
// is legitimate (mirroring); several inputs get merged, which is worth flagging.
export function universeWarnings(u: Universe, ports: Port[]): string[] {
  const ins = portsOf(ports, u.id, false);
  const outs = portsOf(ports, u.id, true);
  const w: string[] = [];
  if (ins.length > 1) {
    w.push(`${ins.length} inputs are merged (${u.mergeMode}).`);
  }
  if (outs.length === 0) w.push('No output: nothing physical receives this universe.');
  return w;
}
