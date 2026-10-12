import { beforeEach, describe, expect, it } from 'vitest';
import { DocSync, type SaveOutcome, type SyncStatus, type Transport } from './docSync';
import { mergeById } from './merge';

// A manual clock: timers only fire when the test says so.
function makeScheduler() {
  const queue: { fn: () => void; ms: number; live: boolean }[] = [];
  const schedule = (fn: () => void, ms: number) => {
    const t = { fn, ms, live: true };
    queue.push(t);
    return () => {
      t.live = false;
    };
  };
  return {
    schedule,
    pending: () => queue.filter((t) => t.live).length,
    async flush() {
      for (const t of queue.splice(0)) if (t.live) t.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

// A fake olad: one document with a revision, plus switches for failure modes.
class FakeServer implements Transport {
  rev = 0;
  data: unknown = null;
  stock = false;
  down = false;
  saves: { rev: number; data: unknown }[] = [];

  async get() {
    if (this.down) throw new Error('network');
    return this.stock ? null : { rev: this.rev, data: this.data };
  }
  async save(rev: number, data: unknown): Promise<SaveOutcome> {
    if (this.down) throw new Error('network');
    if (rev !== this.rev) return { ok: false, conflict: true, rev: this.rev, data: this.data };
    this.rev++;
    this.data = data;
    this.saves.push({ rev, data });
    return { ok: true, rev: this.rev };
  }
}

describe('DocSync', () => {
  let server: FakeServer;
  let clock: ReturnType<typeof makeScheduler>;
  let adopted: unknown[];
  let statuses: SyncStatus[];

  let synced = false;
  const make = (initial: string[], merging = false) =>
    new DocSync<string[]>({
      transport: server,
      initial,
      firstSync: merging
        ? {
            alreadySynced: () => synced,
            markSynced: () => (synced = true),
            merge: (remote, local) => [...remote, ...local.filter((l) => !remote.includes(l))],
          }
        : undefined,
      isEmpty: (v) => v.length === 0,
      onData: (v) => adopted.push(v),
      onStatus: (s) => statuses.push(s),
      schedule: clock.schedule,
    });
  const last = () => statuses[statuses.length - 1];

  beforeEach(() => {
    server = new FakeServer();
    clock = makeScheduler();
    adopted = [];
    statuses = [];
    synced = false;
  });

  it('adopts what olad holds, ignoring a stale local copy', async () => {
    server.rev = 3;
    server.data = ['from-olad'];
    const s = make(['stale-local']);
    await s.start();
    expect(adopted).toEqual([['from-olad']]);
    expect(s.revision).toBe(3);
    expect(last()).toBe('synced');
  });

  it('merges never-synced local data into what olad holds, then publishes it', async () => {
    server.rev = 2;
    server.data = ['shared', 'both'];
    const s = make(['both', 'only-here'], true);
    await s.start();
    expect(server.data).toEqual(['shared', 'both', 'only-here']);
    expect(server.rev).toBe(3);
    expect(adopted.at(-1)).toEqual(['shared', 'both', 'only-here']);
    expect(synced).toBe(true);
  });

  it('does not merge again once this device has synced before', async () => {
    synced = true;
    server.rev = 2;
    server.data = ['shared'];
    const s = make(['deleted-elsewhere'], true);
    await s.start();
    expect(adopted).toEqual([['shared']]);
    expect(server.saves).toEqual([]);
  });

  it('nothing to publish when local adds nothing', async () => {
    server.rev = 1;
    server.data = ['a'];
    const s = make(['a'], true);
    await s.start();
    expect(server.saves).toEqual([]);
    expect(synced).toBe(true);
    expect(last()).toBe('synced');
  });

  it('publishes local data once when olad has none (migration)', async () => {
    const s = make(['mine']);
    await s.start();
    expect(server.saves).toEqual([{ rev: 0, data: ['mine'] }]);
    expect(s.revision).toBe(1);
    expect(last()).toBe('synced');
  });

  it('does not publish an empty document', async () => {
    await make([]).start();
    expect(server.saves).toEqual([]);
    expect(last()).toBe('synced');
  });

  it('stays local forever on stock olad', async () => {
    server.stock = true;
    const s = make(['a']);
    await s.start();
    s.edit(['a', 'b']);
    expect(clock.pending()).toBe(0);
    await s.poll();
    expect(last()).toBe('local');
    expect(server.saves).toEqual([]);
  });

  it('debounces edits into one save', async () => {
    const s = make([]);
    await s.start();
    s.edit(['1']);
    s.edit(['1', '2']);
    s.edit(['1', '2', '3']);
    expect(clock.pending()).toBe(1);
    await clock.flush();
    expect(server.saves).toEqual([{ rev: 0, data: ['1', '2', '3'] }]);
    expect(last()).toBe('synced');
  });

  it('takes the other device\'s version on conflict instead of overwriting it', async () => {
    const s = make([]);
    await s.start();
    // Another device saves first.
    server.rev = 1;
    server.data = ['theirs'];
    s.edit(['mine']);
    await clock.flush();
    expect(server.data).toEqual(['theirs']);
    expect(adopted).toEqual([['theirs']]);
    expect(s.revision).toBe(1);
    expect(last()).toBe('conflict');
  });

  it('saves again with the new revision when edited mid-save', async () => {
    const s = make([]);
    await s.start();
    s.edit(['a']);
    const flushing = clock.flush();
    s.edit(['a', 'b']); // while the first save is in flight
    await flushing;
    await clock.flush();
    expect(server.data).toEqual(['a', 'b']);
    expect(server.rev).toBe(2);
  });

  it('keeps unsent edits and retries when olad is unreachable', async () => {
    const s = make([]);
    await s.start();
    server.down = true;
    s.edit(['x']);
    await clock.flush();
    expect(last()).toBe('offline');
    expect(clock.pending()).toBe(1); // a retry is queued
    server.down = false;
    await clock.flush();
    expect(server.data).toEqual(['x']);
    expect(last()).toBe('synced');
  });

  it('poll adopts newer revisions, but never over unsent edits', async () => {
    const s = make([]);
    await s.start();
    server.rev = 5;
    server.data = ['remote'];
    await s.poll();
    expect(adopted).toEqual([['remote']]);

    s.edit(['typing']); // unsent
    server.rev = 6;
    server.data = ['remote-2'];
    await s.poll();
    expect(adopted).toEqual([['remote']]); // untouched
  });

  it('retries the connection on poll after a failed start', async () => {
    server.down = true;
    const s = make(['a']);
    await s.start();
    expect(last()).toBe('offline');
    server.down = false;
    await s.poll();
    expect(server.saves).toEqual([{ rev: 0, data: ['a'] }]);
  });

  it('poll reports offline without touching data', async () => {
    const s = make([]);
    await s.start();
    server.down = true;
    await s.poll();
    expect(last()).toBe('offline');
    expect(adopted).toEqual([]);
  });
});

describe('mergeById', () => {
  it('keeps remote, adds unknown local, remote wins on the same id', () => {
    const remote = [{ id: 'a', v: 'remote' }, { id: 'b', v: 'r' }];
    const local = [{ id: 'a', v: 'local' }, { id: 'c', v: 'l' }];
    expect(mergeById(remote, local)).toEqual([
      { id: 'a', v: 'remote' },
      { id: 'b', v: 'r' },
      { id: 'c', v: 'l' },
    ]);
  });
  it('handles empty sides', () => {
    expect(mergeById([], [{ id: 'x' }])).toEqual([{ id: 'x' }]);
    expect(mergeById([{ id: 'x' }], [])).toEqual([{ id: 'x' }]);
  });
});
