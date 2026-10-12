import { findConflicts, nextFreeAddress, sequentialAddresses } from './addressing';
import { BUILTIN_PROFILES } from './builtin';
import { footprintOf, type FixtureInst, type Profile } from './model';

// Persisted in the browser for now; the shape is what will move into olad-side storage
// so every phone/tablet/PC sees the same rig.
const PROFILES_KEY = 'olaplus.profiles';
const FIXTURES_KEY = 'olaplus.fixtures';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: keep working in memory */
  }
}

export interface AddRequest {
  profileId: string;
  mode: number;
  count: number;
  universe: number;
  start: number;
  gap: number;
  name: string;
}

class FixtureStore {
  imported = $state<Profile[]>(load(PROFILES_KEY, []));
  fixtures = $state<FixtureInst[]>(load(FIXTURES_KEY, []));

  lookup = (id: string): Profile | undefined =>
    BUILTIN_PROFILES.find((p) => p.id === id) ?? this.imported.find((p) => p.id === id);

  profiles = $derived([...BUILTIN_PROFILES, ...this.imported]);
  conflicts = $derived(findConflicts(this.fixtures, this.lookup));

  #saveFixtures() {
    save(FIXTURES_KEY, this.fixtures);
  }

  addProfile(p: Profile) {
    this.imported = [...this.imported.filter((x) => x.id !== p.id), p];
    save(PROFILES_KEY, this.imported);
  }

  removeProfile(id: string) {
    if (this.fixtures.some((f) => f.profileId === id)) return false; // still in use
    this.imported = this.imported.filter((p) => p.id !== id);
    save(PROFILES_KEY, this.imported);
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
      id: crypto.randomUUID(),
      name: r.count === 1 && !this.#nameTaken(base) ? base : `${base} ${n++}`,
      profileId: r.profileId,
      mode: r.mode,
      universe: r.universe,
      address,
    }));
    this.fixtures = [...this.fixtures, ...created];
    this.#saveFixtures();
    return created.length;
  }

  update(id: string, changes: Partial<Omit<FixtureInst, 'id'>>) {
    this.fixtures = this.fixtures.map((f) => (f.id === id ? { ...f, ...changes } : f));
    this.#saveFixtures();
  }

  remove(id: string) {
    this.fixtures = this.fixtures.filter((f) => f.id !== id);
    this.#saveFixtures();
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
