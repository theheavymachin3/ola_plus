import { newId } from '../id';
import { mergeById } from '../sync/merge';
import { RemoteDoc } from '../sync/remoteDoc.svelte';
import { findConflicts, nextFreeAddress, sequentialAddresses } from './addressing';
import { BUILTIN_PROFILES } from './builtin';
import { footprintOf, type FixtureInst, type Profile } from './model';

export interface AddRequest {
  profileId: string;
  mode: number;
  count: number;
  universe: number;
  start: number;
  gap: number;
  name: string;
}

// Profiles and fixtures are shared through olad's UI store (every device sees the same rig).
// The localStorage copies use the keys from before sharing existed, so an existing rig is
// published the first time an OLA Plus olad is reached.
class FixtureStore {
  readonly profileDoc = new RemoteDoc<Profile[]>('profiles', 'olaplus.profiles', [], (v) => v.length === 0, mergeById);
  readonly fixtureDoc = new RemoteDoc<FixtureInst[]>('fixtures', 'olaplus.fixtures', [], (v) => v.length === 0, mergeById);

  get imported(): Profile[] {
    return Array.isArray(this.profileDoc.data) ? this.profileDoc.data : [];
  }

  get fixtures(): FixtureInst[] {
    return Array.isArray(this.fixtureDoc.data) ? this.fixtureDoc.data : [];
  }

  lookup = (id: string): Profile | undefined =>
    BUILTIN_PROFILES.find((p) => p.id === id) ?? this.imported.find((p) => p.id === id);

  profiles = $derived([...BUILTIN_PROFILES, ...this.imported]);
  conflicts = $derived(findConflicts(this.fixtures, this.lookup));

  start() {
    this.profileDoc.start();
    this.fixtureDoc.start();
  }

  addProfile(p: Profile) {
    this.profileDoc.set([...this.imported.filter((x) => x.id !== p.id), p]);
  }

  removeProfile(id: string) {
    if (this.fixtures.some((f) => f.profileId === id)) return false; // still in use
    this.profileDoc.set(this.imported.filter((p) => p.id !== id));
    return true;
  }

  usage(profileId: string) {
    return this.fixtures.filter((f) => f.profileId === profileId).length;
  }

  /** Suggested start address for the next fixture of this footprint. */
  suggestAddress(universe: number, footprint: number): number {
    return nextFreeAddress(this.fixtures, universe, footprint, this.lookup) ?? 1;
  }

  /** Adds as many fixtures as fit; returns how many were placed. */
  add(r: AddRequest): number {
    const footprint = footprintOf(this.lookup(r.profileId), r.mode);
    const addresses = sequentialAddresses(r.start, footprint, r.count, r.gap);
    const base = r.name.trim() || this.lookup(r.profileId)?.name || 'Fixture';
    let n = this.#nextNumber(base);
    const created = addresses.map<FixtureInst>((address) => ({
      id: newId(),
      name: r.count === 1 && !this.#nameTaken(base) ? base : `${base} ${n++}`,
      profileId: r.profileId,
      mode: r.mode,
      universe: r.universe,
      address,
    }));
    this.fixtureDoc.set([...this.fixtures, ...created]);
    return created.length;
  }

  update(id: string, changes: Partial<Omit<FixtureInst, 'id'>>) {
    this.fixtureDoc.set(this.fixtures.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }

  remove(id: string) {
    this.fixtureDoc.set(this.fixtures.filter((f) => f.id !== id));
  }

  inUniverse(universe: number) {
    return this.fixtures.filter((f) => f.universe === universe).sort((a, b) => a.address - b.address);
  }

  universeIds(): number[] {
    return [...new Set(this.fixtures.map((f) => f.universe))].sort((a, b) => a - b);
  }

  #nameTaken(name: string) {
    return this.fixtures.some((f) => f.name === name);
  }

  #nextNumber(base: string): number {
    const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
    let max = 0;
    for (const f of this.fixtures) {
      const m = re.exec(f.name);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }
}

export const fixtureStore = new FixtureStore();
