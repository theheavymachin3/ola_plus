// State and actions for the Routing tab: which input/output ports feed which universe (OLA calls
// this "patching" a port; the UI's Patch tab is about fixtures and DMX addresses).
import {
  createUniverse,
  fetchFreePorts,
  fetchPatchOverview,
  fetchUniverseInfo,
  fetchUniverseList,
  modifyUniverse,
  type PriorityMode,
} from './api';
import { mixer } from './mixer.svelte';
import {
  buildModel,
  buildModelFromOverview,
  nextFreeUniverse,
  validateNewUniverse,
  type PatchModel,
  type Port,
  type Universe,
} from './patchModel';

const REFRESH_MS = 3000; // USB / network devices come and go

class PatchStore {
  universes = $state<Universe[]>([]);
  ports = $state<Port[]>([]);
  /** Why the last refresh failed (olad unreachable). Cleared by the next good refresh. */
  error = $state('');
  /** Why the last action (patch, create, rename…) failed. Stays until dismissed or the next action. */
  actionError = $state('');
  loaded = $state(false);
  /** True when olad has no patch_overview, so some free ports may be missing from the list. */
  limited = $state(false);

  #timer: ReturnType<typeof setInterval> | undefined;
  #busy = false;

  /** Start auto-refresh; call the returned function to stop. */
  watch(): () => void {
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), REFRESH_MS);
    return () => clearInterval(this.#timer);
  }

  async refresh() {
    if (this.#busy) return;
    this.#busy = true;
    try {
      const m = await this.#readModel();
      this.universes = m.universes;
      this.ports = m.ports;
      this.error = '';
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.#busy = false;
    }
  }

  // Prefer the one-request overview (complete port list). Stock olad doesn't have it, so
  // fall back to composing the patch from the older endpoints; those hide most free ports
  // of devices like Art-Net/sACN, which `limited` lets the UI say.
  async #readModel(): Promise<PatchModel> {
    const overview = await fetchPatchOverview();
    this.limited = overview === null;
    if (overview) return buildModelFromOverview(overview);
    const { universes } = await fetchUniverseList();
    const [details, free] = await Promise.all([
      Promise.all(universes.map((u) => fetchUniverseInfo(u.id))),
      fetchFreePorts(),
    ]);
    return buildModel(details, free);
  }

  universe(id: number) {
    return this.universes.find((u) => u.id === id);
  }

  nextFreeId() {
    return nextFreeUniverse(this.universes);
  }

  dismissActionError() {
    this.actionError = '';
  }

  // Re-read the truth from olad now, even if a refresh was already in flight, and let the
  // mixer's universe list (which feeds the header) catch up too.
  async #reload() {
    this.#busy = false;
    await this.refresh();
    void mixer.refreshUniverses();
  }

  // Run a mutation, then re-read the truth from olad so the UI never drifts. A failure is kept
  // in actionError: the refresh that follows must not wipe it, or the user never sees it.
  async #run(fn: () => Promise<void>) {
    this.actionError = '';
    try {
      await fn();
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : String(e);
    }
    await this.#reload();
  }

  /** Patch a port to a universe (creating it if needed). Moves it if already patched elsewhere. */
  patch(portId: string, universeId: number) {
    return this.#run(async () => {
      const port = this.ports.find((p) => p.id === portId);
      if (port?.universe === universeId) return;
      const target = this.universe(universeId);
      if (!target) return createUniverse(universeId, `Universe ${universeId}`, [portId]);
      if (port?.universe != null) {
        const from = this.universe(port.universe);
        if (from) await modifyUniverse({ id: from.id, name: from.name, removePorts: [portId] });
      }
      await modifyUniverse({ id: target.id, name: target.name, addPorts: [portId] });
    });
  }

  unpatch(portId: string) {
    return this.#run(async () => {
      const port = this.ports.find((p) => p.id === portId);
      const u = port?.universe != null ? this.universe(port.universe) : undefined;
      if (u) await modifyUniverse({ id: u.id, name: u.name, removePorts: [portId] });
    });
  }

  /**
   * Create universe `id` with the given ports (olad needs at least one). Resolves to null on
   * success, or to the reason it failed, for the caller (a dialog) to show.
   */
  async create(id: number, name: string, portIds: string[]): Promise<string | null> {
    const problem = validateNewUniverse(id, this.universes.map((u) => u.id), portIds);
    if (problem) return problem;
    let failure: string | null = null;
    try {
      await createUniverse(id, name.trim() || `Universe ${id}`, portIds);
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    await this.#reload();
    return failure;
  }

  rename(id: number, name: string) {
    const u = this.universe(id);
    if (!u || !name.trim() || name === u.name) return Promise.resolve();
    return this.#run(() => modifyUniverse({ id, name: name.trim() }));
  }

  setMergeMode(id: number, mode: 'HTP' | 'LTP') {
    const u = this.universe(id);
    if (!u) return Promise.resolve();
    return this.#run(() => modifyUniverse({ id, name: u.name, mergeMode: mode }));
  }

  setPriority(port: Port, mode: PriorityMode, value: number) {
    const u = port.universe != null ? this.universe(port.universe) : undefined;
    if (!u) return Promise.resolve();
    return this.#run(() =>
      modifyUniverse({ id: u.id, name: u.name, priorities: [{ portId: port.id, mode, value }] }),
    );
  }
}

export const patch = new PatchStore();
