// All HTTP calls to olad live here. Endpoints are the ones olad already exposes
// (olad/OladHTTPServer.cpp); a push channel will replace polling later.

export interface UniverseSummary {
  id: number;
  name: string;
  input_ports: number;
  output_ports: number;
  rdm_devices: number;
}

export interface PluginSummary {
  id: number;
  name: string;
  active: boolean;
  enabled: boolean;
}

export type PriorityMode = 'inherit' | 'static';

// Raw port as olad serialises it (PortToJson). `priority` is `{}` for ports without
// priority support.
export interface RawPort {
  device: string;
  description: string;
  id: string; // "<device alias>-<I|O>-<port>"
  is_output: boolean;
  priority?: {
    value?: number;
    current_mode?: PriorityMode;
    priority_capability?: 'static' | 'full';
  };
}

export interface RawUniverseInfo {
  id: number;
  name: string;
  merge_mode: 'HTP' | 'LTP';
  input_ports: RawPort[];
  output_ports: RawPort[];
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

async function post(url: string, params: Record<string, string>): Promise<string> {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `${url}: ${r.status}`);
  return text;
}

export async function fetchUniverseList(): Promise<{
  universes: UniverseSummary[];
  plugins: PluginSummary[];
}> {
  const j = await getJson<{ universes?: UniverseSummary[]; plugins?: PluginSummary[] }>(
    '/json/universe_plugin_list',
  );
  return { universes: j.universes ?? [], plugins: j.plugins ?? [] };
}

export const fetchUniverseInfo = (id: number) =>
  getJson<RawUniverseInfo>(`/json/universe_info?id=${id}`);

// Ports not patched to any universe. Note olad stops at the first free port of devices
// that don't allow multi-port patching, so this is not the full port list.
export const fetchFreePorts = () => getJson<RawPort[]>('/json/get_ports');

export interface OverviewPort extends RawPort {
  universe: number | null;
}

export interface PatchOverview {
  devices: { alias: number; name: string; plugin_id: number; ports: OverviewPort[] }[];
  universes: { id: number; name: string; merge_mode: 'HTP' | 'LTP' }[];
}

/**
 * Every device and port with its universe, in one request. Only OLA Plus builds of olad
 * have this endpoint; stock olad (e.g. 0.10.x) answers 404, which gives null so callers
 * can fall back to composing the patch from the older endpoints.
 */
export async function fetchPatchOverview(): Promise<PatchOverview | null> {
  const r = await fetch('/json/patch_overview');
  if (!r.ok) return null;
  try {
    const j = (await r.json()) as Partial<PatchOverview>;
    // A missing "universes" key means olad couldn't list them: treat as unavailable.
    return Array.isArray(j.devices) && Array.isArray(j.universes) ? (j as PatchOverview) : null;
  } catch {
    return null;
  }
}

export async function fetchDmx(universe: number): Promise<number[]> {
  const j = await getJson<{ dmx: number[]; error?: string }>(`/get_dmx?u=${universe}`);
  if (j.error) throw new Error(j.error);
  return j.dmx;
}

export async function sendDmx(universe: number, data: ArrayLike<number>): Promise<void> {
  await post('/set_dmx', { u: String(universe), d: Array.from(data).join(',') });
}

export interface PortPriority {
  portId: string;
  mode: PriorityMode;
  value: number;
}

export interface ModifyUniverseArgs {
  id: number;
  name: string; // olad rejects a modify without a name
  mergeMode?: 'HTP' | 'LTP';
  addPorts?: string[];
  removePorts?: string[];
  priorities?: PortPriority[];
}

export async function modifyUniverse(a: ModifyUniverseArgs): Promise<void> {
  const p: Record<string, string> = { id: String(a.id), name: a.name };
  if (a.mergeMode) p.merge_mode = a.mergeMode;
  if (a.addPorts?.length) p.add_ports = a.addPorts.join(',');
  if (a.removePorts?.length) p.remove_ports = a.removePorts.join(',');
  if (a.priorities?.length) {
    p.modify_ports = a.priorities.map((x) => x.portId).join(',');
    for (const x of a.priorities) {
      p[`${x.portId}_priority_mode`] = x.mode;
      p[`${x.portId}_priority_value`] = String(x.value);
    }
  }
  await post('/modify_universe', p);
}

export interface PluginInfo {
  name: string;
  description: string;
  enabled: boolean;
  active: boolean;
  preferences_source: string;
  conflicts_with: { id: number; name: string; active: boolean }[];
}

export const fetchPluginInfo = (id: number) => getJson<PluginInfo>(`/json/plugin_info?id=${id}`);

export async function setPluginState(id: number, enabled: boolean): Promise<void> {
  await post('/set_plugin_state', { plugin_id: String(id), state: enabled ? 'enable' : 'disable' });
}

// olad re-scans devices and rebuilds ports; ports of reloaded plugins may change.
export async function reloadPlugins(): Promise<void> {
  const r = await fetch('/reload');
  if (!r.ok) throw new Error(`reload: ${r.status}`);
}

export async function createUniverse(id: number, name: string, ports: string[]): Promise<void> {
  const j = JSON.parse(
    await post('/new_universe', { id: String(id), name, add_ports: ports.join(',') }),
  ) as { ok: boolean; message?: string };
  if (!j.ok) throw new Error(j.message || 'Failed to create universe');
}
