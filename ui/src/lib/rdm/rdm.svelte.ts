// State and actions for the RDM tab: find the RDM devices on a universe, read their DMX
// addresses and change them. Every request that reaches the wire goes through one queue,
// because an RDM interface drops a request that arrives while another is still pending.
import {
  rdmDiscover,
  rdmGetIdentify,
  rdmGetPersonalities,
  rdmInfo,
  rdmSetAddress,
  rdmSetIdentify,
  rdmSetLabel,
  rdmSetPersonality,
  rdmUids,
  type RdmUid,
} from '../api';
import { compareUid, newDevice, type AddressChange, type RdmDevice } from './model';
import { SerialQueue } from './queue';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const KEY = 'ola-plus-rdm-on';
function loadEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

class RdmStore {
  /**
   * Whether this UI may talk RDM at all. Off by default: every RDM request takes the DMX line for a
   * moment, so nothing is sent until someone turns it on (and it stays as they left it).
   */
  enabled = $state(loadEnabled());
  universe = $state<number | null>(null);
  devices = $state<RdmDevice[]>([]);
  phase = $state<'idle' | 'discovering' | 'reading' | 'applying'>('idle');
  /** What the current phase is up to, e.g. "Reading 3 of 8". */
  progress = $state('');
  /** A failure of the whole operation (discovery, olad unreachable). Per-device ones live on the device. */
  error = $state('');

  #queue = new SerialQueue();

  /** Turn RDM on or off. Off forgets what was read and sends nothing more. */
  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* the choice just isn't remembered */
    }
    if (!on) {
      // Loops that are reading check this.universe, so clearing it stops them after the request in flight.
      this.universe = null;
      this.devices = [];
      this.phase = 'idle';
      this.progress = '';
      this.error = '';
    }
  }

  get busy() {
    return this.phase !== 'idle';
  }

  /** Switch universe and show what olad already knows about it (no discovery is run). */
  async select(universe: number) {
    if (!this.enabled) return;
    this.universe = universe;
    this.devices = [];
    this.error = '';
    this.progress = '';
    this.phase = 'reading';
    try {
      this.#merge(await rdmUids(universe));
      await this.#readAll(universe);
    } catch (e) {
      this.error = message(e);
    } finally {
      if (this.universe === universe) {
        this.phase = 'idle';
        this.progress = '';
      }
    }
  }

  /** Ask the devices to announce themselves. `incremental` only checks what changed. */
  async discover(incremental: boolean) {
    const universe = this.universe;
    if (!this.enabled || universe === null || this.busy) return;
    this.error = '';
    this.phase = 'discovering';
    this.progress = incremental ? 'Checking for changes…' : 'Searching… this can take a minute on a long chain.';
    try {
      this.#merge(await rdmDiscover(universe, incremental));
      this.phase = 'reading';
      await this.#readAll(universe);
    } catch (e) {
      this.error = message(e);
    } finally {
      if (this.universe === universe) {
        this.phase = 'idle';
        this.progress = '';
      }
    }
  }

  /** Re-read every device's address, e.g. after changing things from another tool. */
  async refresh() {
    const universe = this.universe;
    if (universe === null || this.busy) return;
    this.error = '';
    this.phase = 'reading';
    try {
      await this.#readAll(universe);
    } finally {
      if (this.universe === universe) {
        this.phase = 'idle';
        this.progress = '';
      }
    }
  }

  // Keep what we already know about devices that are still there; drop the ones that left.
  #merge(uids: RdmUid[]) {
    const known = new Map(this.devices.map((d) => [d.uid, d]));
    this.devices = uids
      .map((u) => {
        const old = known.get(u.uid);
        return old ? { ...old, manufacturer: u.manufacturer || old.manufacturer, label: u.device || old.label } : newDevice(u.uid, u.manufacturer, u.device);
      })
      .sort((a, b) => compareUid(a.uid, b.uid));
  }

  async #readAll(universe: number) {
    const uids = this.devices.map((d) => d.uid);
    for (let i = 0; i < uids.length; i++) {
      if (this.universe !== universe) return;
      this.progress = `Reading ${i + 1} of ${uids.length}…`;
      await this.#readInfo(universe, uids[i]);
    }
    // Then the mode lists, so the Mode menu is complete when it opens. Addresses came first
    // because they are what people look at, and each list costs one request per mode.
    for (const d of this.devices) {
      if (this.universe !== universe) return;
      if ((d.personalityCount ?? 0) > 1 && !d.personalities) {
        this.progress = `Reading modes of ${d.label || d.uid}…`;
        await this.loadPersonalities(d.uid);
      }
    }
  }

  #update(uid: string, change: Partial<RdmDevice>) {
    this.devices = this.devices.map((d) => (d.uid === uid ? { ...d, ...change } : d));
  }

  device(uid: string) {
    return this.devices.find((d) => d.uid === uid);
  }

  async #readInfo(universe: number, uid: string) {
    this.#update(uid, { busy: true, error: '' });
    try {
      const info = await this.#queue.run(() => rdmInfo(universe, uid));
      this.#update(uid, {
        address: info.footprint === 0 ? null : info.address,
        footprint: info.footprint,
        personality: info.personality,
        personalityCount: info.personality_count,
      });
    } catch (e) {
      this.#update(uid, { error: message(e) });
    } finally {
      this.#update(uid, { busy: false });
    }
  }

  // Run one change on a device, then read it back so the screen shows what the device really has.
  async #change(uid: string, fn: (universe: number) => Promise<void>): Promise<boolean> {
    const universe = this.universe;
    if (universe === null) return false;
    this.#update(uid, { busy: true, error: '' });
    let ok = true;
    try {
      await this.#queue.run(() => fn(universe));
    } catch (e) {
      ok = false;
      this.#update(uid, { error: message(e) });
    }
    await this.#readInfo(universe, uid);
    return ok;
  }

  setAddress(uid: string, address: number) {
    return this.#change(uid, (u) => rdmSetAddress(u, uid, address));
  }

  async setPersonality(uid: string, personality: number) {
    const ok = await this.#change(uid, (u) => rdmSetPersonality(u, uid, personality));
    // The footprint changed, so the personality list's "selected" and the address limits did too.
    if (ok) await this.loadPersonalities(uid);
    return ok;
  }

  setLabel(uid: string, label: string) {
    return this.#change(uid, (u) => rdmSetLabel(u, uid, label)).then((ok) => {
      if (ok) this.#update(uid, { label });
      return ok;
    });
  }

  async loadPersonalities(uid: string) {
    const universe = this.universe;
    if (universe === null) return;
    try {
      const r = await this.#queue.run(() => rdmGetPersonalities(universe, uid));
      this.#update(uid, { personalities: r.personalities });
    } catch (e) {
      this.#update(uid, { error: message(e) });
    }
  }

  async setIdentify(uid: string, on: boolean) {
    const universe = this.universe;
    if (universe === null) return;
    this.#update(uid, { error: '' });
    try {
      await this.#queue.run(() => rdmSetIdentify(universe, uid, on));
      this.#update(uid, { identify: on });
    } catch (e) {
      this.#update(uid, { error: message(e) });
    }
  }

  async readIdentify(uid: string) {
    const universe = this.universe;
    if (universe === null) return;
    try {
      this.#update(uid, { identify: await this.#queue.run(() => rdmGetIdentify(universe, uid)) });
    } catch (e) {
      this.#update(uid, { error: message(e) });
    }
  }

  /** Apply a list of address changes one by one. Returns how many worked and how many did not. */
  async applyChanges(changes: AddressChange[]): Promise<{ done: number; failed: number }> {
    if (this.busy) return { done: 0, failed: changes.length };
    this.phase = 'applying';
    let done = 0;
    let failed = 0;
    try {
      for (let i = 0; i < changes.length; i++) {
        this.progress = `Setting address ${i + 1} of ${changes.length}…`;
        if (await this.setAddress(changes[i].uid, changes[i].to)) done++;
        else failed++;
      }
    } finally {
      this.phase = 'idle';
      this.progress = '';
    }
    return { done, failed };
  }
}

export const rdmStore = new RdmStore();
