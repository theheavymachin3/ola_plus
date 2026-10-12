import { fetchUiDoc, saveUiDoc } from '../api';
import { DocSync, type SyncStatus } from './docSync';

const POLL_MS = 4000;

// A document that lives on olad (so every device shares it) with a copy in localStorage so the
// UI paints instantly and still has something if olad is briefly unreachable. Components
// read `data` and call `set()`; everything else is handled by DocSync.
export class RemoteDoc<T> {
  data = $state() as T;
  status = $state<SyncStatus>('local');
  /** Set (to Date.now()) whenever another device's version replaced ours after a clash. */
  conflictAt = $state(0);

  readonly #sync: DocSync<T>;
  readonly #cacheKey: string;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    key: string,
    cacheKey: string,
    fallback: T,
    isEmpty: (v: T) => boolean,
    /** How to combine never-synced local data with what olad already holds (first connect only). */
    merge?: (remote: T, local: T) => T,
  ) {
    this.#cacheKey = cacheKey;
    this.data = this.#readCache() ?? fallback;
    this.#sync = new DocSync<T>({
      transport: {
        get: () => fetchUiDoc(key),
        save: (rev, data) => saveUiDoc(key, rev, data),
      },
      initial: this.data,
      isEmpty,
      firstSync: merge
        ? { alreadySynced: () => this.#syncedBefore(), markSynced: () => this.#markSynced(), merge }
        : undefined,
      onData: (v) => {
        this.data = v;
        this.#writeCache(v);
      },
      onStatus: (s) => {
        this.status = s;
        if (s === 'conflict') this.conflictAt = Date.now();
      },
    });
  }

  /** Replace the document. Always pass a new array/object (don't mutate in place). */
  set(next: T) {
    this.data = next;
    this.#writeCache(next);
    this.#sync.edit(next);
  }

  /** Connect to olad and keep watching for changes from other devices. */
  start() {
    if (this.#timer) return;
    void this.#sync.start();
    this.#timer = setInterval(() => void this.#sync.poll(), POLL_MS);
  }

  #syncedBefore(): boolean {
    try {
      return localStorage.getItem(this.#cacheKey + '.synced') === '1';
    } catch {
      return false;
    }
  }

  #markSynced() {
    try {
      localStorage.setItem(this.#cacheKey + '.synced', '1');
    } catch {
      /* ignore */
    }
  }

  #readCache(): T | undefined {
    try {
      const raw = localStorage.getItem(this.#cacheKey);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  #writeCache(v: T) {
    try {
      localStorage.setItem(this.#cacheKey, JSON.stringify(v));
    } catch {
      /* private mode / quota: still synced to olad */
    }
  }
}
