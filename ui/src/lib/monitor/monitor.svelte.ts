import { fetchDmx } from '../api';
import { startPolling } from '../poll';
import { changedChannels } from './cells';

const POLL_MS = 200; // ~5 updates a second
const FLASH_MS = 350;

// Live view of one universe's output as olad holds it (the merged result of every source,
// not just this browser's mixer).
class Monitor {
  values = $state<number[]>(new Array(512).fill(0));
  /** Channels that changed in the latest update, for a brief highlight. */
  flash = $state<ReadonlySet<number>>(new Set());
  paused = $state(false);
  /** null when updates are arriving; otherwise why they are not. */
  problem = $state<string | null>(null);

  #stop: (() => void) | null = null;
  #prev: number[] | null = null;
  #universe = -1;
  #flashTimer: ReturnType<typeof setTimeout> | undefined;

  /** Start following `universe()` (read each time, so it can change under us). */
  start(universe: () => number) {
    this.stop();
    this.#stop = startPolling(async () => {
      if (this.paused) return;
      const u = universe();
      if (u !== this.#universe) {
        this.#universe = u;
        this.#prev = null;
      }
      try {
        const d = await fetchDmx(u);
        if (u !== universe()) return; // the universe changed while we waited
        const next = Array.from({ length: 512 }, (_, i) => d[i] ?? 0);
        const changed = changedChannels(this.#prev, next);
        this.#prev = next;
        this.values = next;
        this.problem = null;
        if (changed.length) {
          this.flash = new Set(changed);
          clearTimeout(this.#flashTimer);
          this.#flashTimer = setTimeout(() => (this.flash = new Set()), FLASH_MS);
        }
      } catch (e) {
        this.problem = e instanceof Error ? e.message : String(e);
        this.values = new Array(512).fill(0);
        this.#prev = null;
      }
    }, POLL_MS);
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
    clearTimeout(this.#flashTimer);
  }
}

export const monitor = new Monitor();
