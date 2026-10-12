import { fetchDmx, fetchUniverseList, sendDmx, type UniverseSummary } from './api';

const SLOTS = 512;
const SEND_INTERVAL_MS = 40; // ~25 fps max towards olad
const POLL_INTERVAL_MS = 750;
const IDLE_BEFORE_POLL_MS = 1200;

// Levels are what the operator set (0-255); output = level * master, or 0 on blackout.
// Keeping them separate means master/blackout never destroy the underlying look.
class Mixer {
  universes = $state<UniverseSummary[]>([]);
  universe = $state(1);
  levels = $state<number[]>(new Array(SLOTS).fill(0));
  master = $state(100); // percent
  blackout = $state(false);
  online = $state(false);

  #dirty = false;
  #lastEdit = 0;

  output(): number[] {
    const k = this.blackout ? 0 : this.master / 100;
    return this.levels.map((v) => Math.round(v * k));
  }

  async start() {
    await this.#refreshUniverses();
    await this.selectUniverse(this.universe);
    setInterval(() => this.#tick(), SEND_INTERVAL_MS);
    setInterval(() => this.#poll(), POLL_INTERVAL_MS);
  }

  async #refreshUniverses() {
    try {
      this.universes = (await fetchUniverseList()).universes;
      this.online = true;
      if (this.universes.length && !this.universes.some((u) => u.id === this.universe)) {
        this.universe = this.universes[0].id;
      }
    } catch {
      this.online = false;
    }
  }

  async selectUniverse(id: number) {
    this.universe = id;
    try {
      const d = await fetchDmx(id);
      this.levels = Array.from({ length: SLOTS }, (_, i) => d[i] ?? 0);
      this.online = true;
    } catch {
      this.online = false;
    }
  }

  setLevel(ch: number, value: number) {
    this.levels[ch] = Math.max(0, Math.min(255, Math.round(value)));
    this.touch();
  }

  setMaster(pct: number) {
    this.master = Math.max(0, Math.min(100, Math.round(pct)));
    this.touch();
  }

  toggleBlackout() {
    this.blackout = !this.blackout;
    this.touch();
  }

  clearAll() {
    this.levels = new Array(SLOTS).fill(0);
    this.touch();
  }

  touch() {
    this.#dirty = true;
    this.#lastEdit = Date.now();
  }

  async #tick() {
    if (!this.#dirty) return;
    this.#dirty = false;
    try {
      await sendDmx(this.universe, this.output());
      this.online = true;
    } catch {
      this.online = false;
    }
  }

  // Adopt changes made by other clients, but only while this one is idle and the
  // output isn't being scaled (otherwise we'd read back scaled values as levels).
  async #poll() {
    if (this.#dirty || Date.now() - this.#lastEdit < IDLE_BEFORE_POLL_MS) return;
    if (this.master !== 100 || this.blackout) return;
    try {
      const d = await fetchDmx(this.universe);
      for (let i = 0; i < SLOTS; i++) {
        const v = d[i] ?? 0;
        if (this.levels[i] !== v) this.levels[i] = v;
      }
      this.online = true;
    } catch {
      this.online = false;
    }
  }
}

export const mixer = new Mixer();
