// Keeps one document in step with olad's UI store. Plain TypeScript with the network and the
// clock injected, so every path (migration, conflict, offline, stock olad) is unit tested.
//
// The rules, in short:
//  - olad is the source of truth. On start, if it has the document we adopt it; if it has
//    none and we hold local data (the old browser-only storage), we upload that once.
//  - Saves name the revision we last saw. If another device got there first, olad refuses
//    and sends its version: we adopt it (and say so) instead of overwriting their work.
//  - While we have unsent edits we never adopt, so polling can't clobber what is being typed.
//  - Stock olad has no store: we stay local and never try again.

export type SyncStatus = 'local' | 'synced' | 'saving' | 'offline' | 'conflict';

export type SaveOutcome =
  | { ok: true; rev: number }
  | { ok: false; conflict: true; rev: number; data: unknown };

export interface Transport {
  /** null means olad has no store (stock olad). Throws on network trouble. */
  get(): Promise<{ rev: number; data: unknown } | null>;
  /** Throws on network trouble or a server error. */
  save(rev: number, data: unknown): Promise<SaveOutcome>;
}

export interface Scheduler {
  (fn: () => void, ms: number): () => void; // returns a cancel function
}

export interface DocSyncOptions<T> {
  transport: Transport;
  initial: T;
  isEmpty: (value: T) => boolean;
  onData: (value: T) => void; // called when we adopt a version from olad
  onStatus: (status: SyncStatus) => void;
  /**
   * The first time this device meets an olad that already has the document, local data that
   * was never synced is merged in rather than discarded. Omit to let olad's version win.
   */
  firstSync?: {
    alreadySynced: () => boolean;
    markSynced: () => void;
    merge: (remote: T, local: T) => T;
  };
  debounceMs?: number;
  retryMs?: number;
  schedule?: Scheduler;
}

const defaultSchedule: Scheduler = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export class DocSync<T> {
  readonly #o: DocSyncOptions<T>;
  readonly #schedule: Scheduler;
  #data: T;
  #rev = 0;
  /** undefined: not known yet (never reached olad); false: stock olad. */
  #available: boolean | undefined;
  #dirty = false;
  #saving = false;
  #cancelTimer: (() => void) | null = null;

  constructor(options: DocSyncOptions<T>) {
    this.#o = options;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#data = options.initial;
  }

  get revision() {
    return this.#rev;
  }

  /** Connect to olad and reconcile with what it holds. Safe to call again after a failure. */
  async start(): Promise<void> {
    try {
      const remote = await this.#o.transport.get();
      if (remote === null) {
        this.#available = false;
        this.#o.onStatus('local');
        return;
      }
      this.#available = true;
      const first = this.#o.firstSync;
      const unsyncedLocal = !!first && !first.alreadySynced() && !this.#o.isEmpty(this.#data);
      if (remote.rev > 0 && unsyncedLocal) {
        // Olad already has data, and so does this device from before it was shared.
        const merged = first!.merge(remote.data as T, this.#data);
        const changed = JSON.stringify(merged) !== JSON.stringify(remote.data);
        this.#adopt(remote.rev, merged);
        if (changed) {
          this.#dirty = true;
          await this.#save();
        } else {
          this.#o.onStatus('synced');
        }
      } else if (remote.rev > 0) {
        this.#adopt(remote.rev, remote.data);
        this.#o.onStatus('synced');
      } else if (!this.#o.isEmpty(this.#data)) {
        // Olad has nothing yet but this device does: publish it (first-run migration).
        this.#rev = 0;
        this.#dirty = true;
        await this.#save();
      } else {
        this.#rev = 0;
        this.#o.onStatus('synced');
      }
      if (!this.#dirty) this.#o.firstSync?.markSynced();
    } catch {
      this.#o.onStatus('offline');
    }
  }

  /** The local value changed: remember it and schedule a save. */
  edit(next: T): void {
    this.#data = next;
    if (this.#available === false) return; // stock olad: local only
    this.#dirty = true;
    this.#queueSave(this.#o.debounceMs ?? 400);
  }

  /** Look for changes made by other devices (call periodically). */
  async poll(): Promise<void> {
    if (this.#available === undefined) return this.start();
    if (this.#available === false || this.#dirty || this.#saving) return;
    try {
      const remote = await this.#o.transport.get();
      if (remote === null || this.#dirty || this.#saving) return; // edited meanwhile
      if (remote.rev > this.#rev) {
        this.#adopt(remote.rev, remote.data);
      }
      this.#o.onStatus('synced');
    } catch {
      this.#o.onStatus('offline');
    }
  }

  #adopt(rev: number, data: unknown) {
    this.#rev = rev;
    this.#data = data as T;
    this.#dirty = false;
    this.#o.onData(this.#data);
  }

  #queueSave(ms: number) {
    this.#cancelTimer?.();
    this.#cancelTimer = this.#schedule(() => {
      this.#cancelTimer = null;
      void this.#save();
    }, ms);
  }

  async #save(): Promise<void> {
    if (this.#saving || !this.#dirty || this.#available === false) return;
    this.#saving = true;
    this.#o.onStatus('saving');
    const sent = this.#data;
    try {
      const out = await this.#o.transport.save(this.#rev, sent);
      this.#saving = false;
      if (out.ok) {
        this.#rev = out.rev;
        this.#o.firstSync?.markSynced();
        if (this.#data === sent) {
          this.#dirty = false;
          this.#o.onStatus('synced');
        } else {
          this.#queueSave(0); // edited while saving: go again with the new revision
        }
      } else {
        // Someone else saved first. Take their version rather than overwrite it.
        this.#adopt(out.rev, out.data);
        this.#o.onStatus('conflict');
      }
    } catch {
      this.#saving = false;
      this.#o.onStatus('offline');
      this.#queueSave(this.#o.retryMs ?? 3000);
    }
  }
}
