// Runs the UI's real API client against a live olad. Skipped unless OLA_URL is set, e.g.
//   OLA_URL=http://127.0.0.1:9090 npx vitest run src/lib/api.integration.test.ts
// CI starts olad built from this tree and sets it. The tests assume olad's Dummy plugin
// (enabled by default) so there is at least one patchable port.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createUniverse,
  fetchDmx,
  fetchFreePorts,
  fetchPatchOverview,
  fetchPluginInfo,
  fetchUniverseInfo,
  fetchUniverseList,
  modifyUniverse,
  reloadPlugins,
  sendDmx,
  type RawPort,
} from './api';
import { buildModel, buildModelFromOverview } from './patchModel';

const base = process.env.OLA_URL;
const UNIVERSE = 41; // unlikely to clash with a user's rig on a dev machine

describe.skipIf(!base)('UI api client against a real olad', () => {
  let port: RawPort;
  let initialMerge: 'HTP' | 'LTP';

  beforeAll(() => {
    // api.ts uses same-origin paths (the browser talks to olad through Vite's proxy).
    const real = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      real(typeof input === 'string' && input.startsWith('/') ? base + input : input, init)) as typeof fetch;
  });

  it('lists plugins and universes in the shape the UI expects', async () => {
    const { plugins, universes } = await fetchUniverseList();
    expect(plugins.length).toBeGreaterThan(0);
    for (const p of plugins) {
      expect(typeof p.id).toBe('number');
      expect(typeof p.name).toBe('string');
      expect(typeof p.active).toBe('boolean');
      expect(typeof p.enabled).toBe('boolean');
    }
    expect(Array.isArray(universes)).toBe(true);
  });

  it('returns unpatched ports with ids like <alias>-<I|O>-<n>', async () => {
    const free = await fetchFreePorts();
    const out = free.find((p) => p.is_output);
    expect(out, 'olad exposes no free output port (is the Dummy plugin enabled?)').toBeDefined();
    port = out!;
    expect(port.id).toMatch(/^\d+-O-\d+$/);
    expect(typeof port.device).toBe('string');
    expect(typeof port.priority).toBe('object');
  });

  it('creates a universe with a port and reads it back', async () => {
    await createUniverse(UNIVERSE, 'ci universe', [port.id]);
    const info = await fetchUniverseInfo(UNIVERSE);
    expect(info.name).toBe('ci universe');
    expect(['HTP', 'LTP']).toContain(info.merge_mode);
    initialMerge = info.merge_mode;
    expect(info.output_ports.map((p) => p.id)).toContain(port.id);
  });

  it('builds a patch model that marks the port as patched', async () => {
    const { universes } = await fetchUniverseList();
    const details = await Promise.all(universes.map((u) => fetchUniverseInfo(u.id)));
    const model = buildModel(details, await fetchFreePorts());
    expect(model.ports.find((p) => p.id === port.id)?.universe).toBe(UNIVERSE);
    expect(model.universes.some((u) => u.id === UNIVERSE)).toBe(true);
  });

  it('serves the whole patch in one request (OLA Plus patch_overview)', async () => {
    const overview = await fetchPatchOverview();
    expect(overview, 'olad built from this tree must serve /json/patch_overview').not.toBeNull();
    const all = overview!.devices.flatMap((d) => d.ports);
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(p.id).toMatch(/^\d+-[IO]-\d+$/);
      expect(p.universe === null || typeof p.universe === 'number').toBe(true);
    }
    // The patched port reports its universe; the universe list carries name and merge mode.
    expect(all.find((p) => p.id === port.id)?.universe).toBe(UNIVERSE);
    const u = overview!.universes.find((x) => x.id === UNIVERSE);
    expect(u?.name).toBe('ci universe');
    expect(['HTP', 'LTP']).toContain(u?.merge_mode);
    // It is a superset of get_ports, which hides ports beyond the first per device.
    const listed = new Set(all.map((p) => p.id));
    for (const f of await fetchFreePorts()) expect(listed.has(f.id)).toBe(true);
    // And the model built from it agrees with the per-universe one.
    const m = buildModelFromOverview(overview!);
    expect(m.ports.find((p) => p.id === port.id)?.universe).toBe(UNIVERSE);
  });

  it('renames and changes merge mode (name is mandatory on modify)', async () => {
    const flipped = initialMerge === 'HTP' ? 'LTP' : 'HTP';
    await modifyUniverse({ id: UNIVERSE, name: 'renamed', mergeMode: flipped });
    const info = await fetchUniverseInfo(UNIVERSE);
    expect(info.name).toBe('renamed');
    expect(info.merge_mode).toBe(flipped);
  });

  it('sets a static priority when the port supports it', async () => {
    const cap = (await fetchUniverseInfo(UNIVERSE)).output_ports[0].priority?.priority_capability;
    if (!cap) return; // Dummy ports have no priority support; nothing to assert
    await modifyUniverse({ id: UNIVERSE, name: 'renamed', priorities: [{ portId: port.id, mode: 'static', value: 55 }] });
    const after = (await fetchUniverseInfo(UNIVERSE)).output_ports[0].priority;
    expect(after?.value).toBe(55);
  });

  it('round-trips DMX through set_dmx / get_dmx', async () => {
    await sendDmx(UNIVERSE, [1, 2, 3, 250]);
    const dmx = await fetchDmx(UNIVERSE);
    expect(dmx.slice(0, 4)).toEqual([1, 2, 3, 250]);
  });

  it('returns plugin details', async () => {
    const { plugins } = await fetchUniverseList();
    const info = await fetchPluginInfo(plugins[0].id);
    expect(typeof info.description).toBe('string');
    expect(typeof info.enabled).toBe('boolean');
    expect(Array.isArray(info.conflicts_with)).toBe(true);
  });

  it('unpatches the port again', async () => {
    await modifyUniverse({ id: UNIVERSE, name: 'renamed', removePorts: [port.id] });
    const free = await fetchFreePorts();
    expect(free.map((p) => p.id)).toContain(port.id);
  });

  it('reloads plugins without error', async () => {
    await expect(reloadPlugins()).resolves.toBeUndefined();
    expect((await fetchUniverseList()).plugins.length).toBeGreaterThan(0);
  });
});
