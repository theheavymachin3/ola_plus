import { fixtureStore } from '../fixtures/store.svelte';
import { newId } from '../id';
import { mixer } from '../mixer.svelte';
import { mergeById } from '../sync/merge';
import { RemoteDoc } from '../sync/remoteDoc.svelte';
import { buildScale, type Group } from './model';

// Group definitions are shared through olad's UI store like fixtures and scenes. Fader
// positions are not: they are the live state of this mixer, back at 100% on reload.
class GroupStore {
  readonly doc = new RemoteDoc<Group[]>('groups', 'olaplus.groups', [], (v) => v.length === 0, mergeById);
  /** Group fader positions in percent; a missing id means 100. */
  levels = $state<Record<string, number>>({});

  get groups(): Group[] {
    return Array.isArray(this.doc.data) ? this.doc.data : [];
  }

  start() {
    this.doc.start();
  }

  inUniverse(universe: number): Group[] {
    return this.groups.filter((g) => g.universe === universe);
  }

  level(id: string): number {
    return this.levels[id] ?? 100;
  }

  setLevel(id: string, pct: number) {
    this.levels = { ...this.levels, [id]: Math.max(0, Math.min(100, Math.round(pct))) };
  }

  nextName(universe: number): string {
    return `Group ${this.inUniverse(universe).length + 1}`;
  }

  add(group: Omit<Group, 'id'>): Group {
    const created: Group = { ...group, id: newId() };
    this.doc.set([...this.groups, created]);
    return created;
  }

  update(id: string, changes: Partial<Omit<Group, 'id'>>) {
    this.doc.set(this.groups.map((g) => (g.id === id ? { ...g, ...changes } : g)));
  }

  remove(id: string) {
    this.doc.set(this.groups.filter((g) => g.id !== id));
    const { [id]: _gone, ...rest } = this.levels;
    this.levels = rest;
  }
}

export const groupStore = new GroupStore();

// Keep the mixer's per-channel scaling in step with the groups, their fader positions, the
// fixtures they follow and the universe on screen. A module-level effect: it lives as long
// as the app and only ever recomputes when one of those actually changes.
$effect.root(() => {
  $effect(() => {
    mixer.setScale(
      buildScale(groupStore.groups, groupStore.levels, mixer.universe, fixtureStore.fixtures, fixtureStore.lookup),
    );
  });
});
