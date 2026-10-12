import { fetchDmx, fetchServerStats, type ServerStats } from '../api';
import { startPolling } from '../poll';

const POLL_MS = 2000;

// Server facts and a light DMX snapshot per universe, polled only while the Overview is open.
class OverviewStore {
  stats = $state<ServerStats | null>(null);
  /** False once a request to olad fails; true again when one succeeds. */
  reachable = $state(true);
  dmx = $state<Record<number, number[]>>({});

  #stop: (() => void) | null = null;

  start(universeIds: () => number[]) {
    this.stop();
    this.#stop = startPolling(async () => {
      try {
        this.stats = await fetchServerStats();
        this.reachable = true;
      } catch {
        this.reachable = false;
        return;
      }
      const next: Record<number, number[]> = {};
      await Promise.all(
        universeIds().map(async (id) => {
          try {
            next[id] = await fetchDmx(id);
          } catch {
            /* a universe with nothing on it can't be read; show it as dark */
          }
        }),
      );
      this.dmx = next;
    }, POLL_MS);
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }
}

export const overviewStore = new OverviewStore();
