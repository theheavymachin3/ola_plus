import {
  createUniverse,
  fetchFreePorts,
  fetchUniverseInfo,
  fetchUniverseList,
  modifyUniverse,
  type PriorityMode,
} from './api';
import { buildModel, nextFreeUniverse, type Port, type Universe } from './patchModel';

const REFRESH_MS = 3000; // USB / network devices come and go

class PatchStore {
  universes = $state<Universe[]>([]);
  ports = $state<Port[]>([]);
  error = $state('');
  loaded = $state(false);

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
      const { universes } = await fetchUniverseList();
      const [details, free] = await Promise.all([
        Promise.all(universes.map((u) => fetchUniverseInfo(u.id))),
        fetchFreePorts(),
      ]);
      const m = buildModel(details, free);
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

  universe(id: number) {
    return this.universes.find((u) => u.id === id);
  }

  nextFreeId() {
    return nextFreeUniverse(this.universes);
  }

  // Run a mutation, then re-read the truth from olad so the UI never drifts.
  async #run(fn: () => Promise<void>) {
    try {
      await fn();
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.#busy = false;
    await this.refresh();
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

  newUniverse(name: string, portIds: string[] = []) {
    return this.#run(async () => {
      const id = this.nextFreeId();
      await createUniverse(id, name || `Universe ${id}`, portIds);
    });
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
