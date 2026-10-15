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

// --- Shared UI documents (fixtures, scenes, ...) kept by OLA Plus builds of olad ---------

export interface UiDoc {
  rev: number;
  data: unknown;
}

/** null when olad has no store (stock olad answers 404). Throws on network/server errors. */
export async function fetchUiDoc(key: string): Promise<UiDoc | null> {
  const r = await fetch(`/json/ui_store?k=${encodeURIComponent(key)}`);
  if (r.status === 404 || r.status === 405) return null;
  if (!r.ok) throw new Error(`ui_store: ${r.status}`);
  const j = (await r.json()) as UiDoc;
  return { rev: j.rev, data: j.data };
}

export type UiSave =
  | { ok: true; rev: number }
  | { ok: false; conflict: true; rev: number; data: unknown };

/** Saves against the revision we last saw; a 409 carries the version that beat us. */
export async function saveUiDoc(key: string, rev: number, data: unknown): Promise<UiSave> {
  const r = await fetch('/ui_store', {
    method: 'POST',
    body: new URLSearchParams({ k: key, rev: String(rev), d: JSON.stringify(data) }),
  });
  if (r.status === 409) {
    const j = (await r.json()) as { rev: number; data: unknown };
    return { ok: false, conflict: true, rev: j.rev, data: j.data };
  }
  if (!r.ok) throw new Error(`ui_store save: ${r.status}`);
  return { ok: true, rev: ((await r.json()) as { rev: number }).rev };
}

// --- Server info ---------------------------------------------------------------------------

export interface ServerStats {
  hostname: string;
  instance_name: string;
  config_dir: string;
  ip: string;
  broadcast: string;
  subnet: string;
  hw_address: string;
  version: string;
  build: string;
  up_since: string; // already formatted by olad ("Mon Oct 12 21:58:22 2026")
  quit_enabled: boolean;
}

export const fetchServerStats = () => getJson<ServerStats>('/json/server_stats');

// --- Host health (CPU temperature, power; Raspberry Pi firmware readings when available) -----

export interface SystemStats {
  platform: 'raspberry-pi' | 'linux' | 'other';
  model?: string;
  cpu_temp_c?: number;
  cpu_freq_mhz?: number;
  cpu_max_freq_mhz?: number;
  undervoltage_alarm?: boolean; // the kernel's alarm, set right now
  load?: [number, number, number];
  mem_total_kb?: number;
  mem_available_kb?: number;
  uptime_s?: number;
  /** Only on a Raspberry Pi whose ola-plus-sysinfo service is running; absent when stale. */
  firmware?: {
    age_s: number;
    volts: Partial<Record<'core' | 'sdram_c' | 'sdram_i' | 'sdram_p', number>>;
    throttled?: number; // vcgencmd get_throttled bit field
    arm_clock_hz?: number;
  };
  /** Only on a machine with a Wi-Fi radio. */
  wifi?: {
    enabled: boolean;
    hard_blocked: boolean; // a physical switch holds it off
    controllable: boolean; // the ola-plus-net service is there to switch it
    connected?: boolean; // a Wi-Fi interface has its link up
  };
  /** Only on a machine with a wired interface. */
  ethernet?: { connected: boolean };
}

export const fetchSystemStats = () => getJson<SystemStats>('/json/system_stats');

/** Asks olad to switch the Wi-Fi radio; the new state shows up in the next system_stats. */
export const setWifi = (on: boolean) => wifiPost('/json/wifi', { state: on ? 'on' : 'off' });

// --- Wi-Fi networks in range and joining one -------------------------------------------------

export interface WifiNetwork {
  ssid: string;
  signal: number; // 0 - 100
  security: string; // "--" for an open network, else e.g. "WPA2", "WPA3", "WPA2 802.1X"
  in_use: boolean;
}

export interface WifiConnectResult {
  status: 'connecting' | 'ok' | 'failed';
  ssid: string;
  message: string;
  age_s: number;
}

export interface WifiNetworks {
  networks: WifiNetwork[];
  scan_age_s?: number;
  connect?: WifiConnectResult;
}

export const fetchWifiNetworks = () => getJson<WifiNetworks>('/json/wifi_networks');

async function wifiPost(path: string, params: Record<string, string>): Promise<void> {
  const r = await fetch(path, { method: 'POST', body: new URLSearchParams(params) });
  if (r.ok) return;
  let msg = `Wi-Fi: ${r.status}`;
  try {
    msg = ((await r.json()) as { error?: string }).error || msg;
  } catch {
    /* not JSON */
  }
  throw new Error(msg);
}

export const scanWifi = () => wifiPost('/json/wifi_scan', {});

/** An empty password means an open network. The result appears in fetchWifiNetworks().connect. */
export const connectWifi = (ssid: string, password: string, hidden: boolean) =>
  wifiPost('/json/wifi_connect', { ssid, password, hidden: hidden ? 'true' : 'false' });

// --- RDM (discovery, DMX addresses, identify) ---------------------------------------------------
// olad answers these with `error: ""` on success. They are all GET, as in olad's own UI.

export interface RdmUid {
  uid: string;
  manufacturer: string;
  device: string; // the device label, once olad has resolved it
}

async function rdmGet<T extends { error?: string }>(path: string, params: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const j = await getJson<T>(`${path}?${q}`);
  if (j.error) throw new Error(j.error);
  return j;
}

/** Full discovery can take a minute on a long chain; the request simply waits for it. */
export async function rdmDiscover(universe: number, incremental: boolean): Promise<RdmUid[]> {
  const q = new URLSearchParams({ id: String(universe), incremental: String(incremental) });
  const j = await getJson<{ uids?: RdmUid[] }>(`/rdm/run_discovery?${q}`);
  return j.uids ?? [];
}

export async function rdmUids(universe: number): Promise<RdmUid[]> {
  const j = await getJson<{ uids?: RdmUid[] }>(`/json/rdm/uids?id=${universe}`);
  return j.uids ?? [];
}

export interface RdmInfo {
  address: number;
  footprint: number;
  personality: number;
  personality_count: number;
}

export const rdmInfo = (universe: number, uid: string) =>
  rdmGet<RdmInfo & { error?: string }>('/json/rdm/uid_info', { id: universe, uid });

export async function rdmGetIdentify(universe: number, uid: string): Promise<boolean> {
  return (await rdmGet<{ identify_device: boolean; error?: string }>('/json/rdm/uid_identify_device', { id: universe, uid }))
    .identify_device;
}

export async function rdmGetPersonalities(
  universe: number,
  uid: string,
): Promise<{ personalities: { index: number; name: string; footprint: number }[]; selected: number }> {
  const j = await rdmGet<{
    personalities?: { index: number; name: string; footprint: number }[];
    selected?: number;
    error?: string;
  }>('/json/rdm/uid_personalities', { id: universe, uid });
  return { personalities: j.personalities ?? [], selected: j.selected ?? 0 };
}

export async function rdmGetLabel(universe: number, uid: string): Promise<string> {
  const j = await rdmGet<{ items?: { value?: string }[]; error?: string }>('/json/rdm/section_info', {
    id: universe,
    uid,
    section: 'device_label',
  });
  return j.items?.[0]?.value ?? '';
}

async function rdmSet(universe: number, uid: string, section: string, field: Record<string, string | number>) {
  await rdmGet('/json/rdm/set_section_info', { id: universe, uid, section, ...field });
}

export const rdmSetAddress = (universe: number, uid: string, address: number) =>
  rdmSet(universe, uid, 'dmx_address', { address });
export const rdmSetPersonality = (universe: number, uid: string, personality: number) =>
  rdmSet(universe, uid, 'personality', { int: personality });
export const rdmSetIdentify = (universe: number, uid: string, on: boolean) =>
  rdmSet(universe, uid, 'identify_device', { bool: on ? 1 : 0 });
export const rdmSetLabel = (universe: number, uid: string, label: string) =>
  rdmSet(universe, uid, 'device_label', { label });
