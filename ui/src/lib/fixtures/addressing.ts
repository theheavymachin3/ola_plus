// Pure DMX addressing logic: occupancy, overlap detection, auto-addressing.
import { DMX_SLOTS, footprintOf, type FixtureInst, type Profile } from './model';

export type ProfileLookup = (id: string) => Profile | undefined;

export interface Span {
  id: string;
  first: number; // 1-based, inclusive
  last: number;
}

export function spanOf(f: FixtureInst, lookup: ProfileLookup): Span {
  const n = Math.max(1, footprintOf(lookup(f.profileId), f.mode));
  return { id: f.id, first: f.address, last: f.address + n - 1 };
}

export const fitsUniverse = (address: number, footprint: number) =>
  address >= 1 && footprint >= 1 && address + footprint - 1 <= DMX_SLOTS;

/** Fixture ids that overlap another fixture on the same universe, or run past slot 512. */
export function findConflicts(fixtures: FixtureInst[], lookup: ProfileLookup): Set<string> {
  const bad = new Set<string>();
  const byUniverse = new Map<number, Span[]>();
  for (const f of fixtures) {
    const s = spanOf(f, lookup);
    if (s.last > DMX_SLOTS || s.first < 1) bad.add(f.id);
    const list = byUniverse.get(f.universe) ?? [];
    list.push(s);
    byUniverse.set(f.universe, list);
  }
  for (const spans of byUniverse.values()) {
    spans.sort((a, b) => a.first - b.first);
    let reach: Span | undefined; // span reaching furthest so far
    for (const s of spans) {
      if (reach && s.first <= reach.last) {
        bad.add(s.id);
        bad.add(reach.id);
      }
      if (!reach || s.last > reach.last) reach = s;
    }
  }
  return bad;
}

/** slot (1..512) -> fixture ids occupying it, for one universe. */
export function occupancy(
  fixtures: FixtureInst[],
  universe: number,
  lookup: ProfileLookup,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const f of fixtures) {
    if (f.universe !== universe) continue;
    const { first, last } = spanOf(f, lookup);
    for (let s = Math.max(1, first); s <= Math.min(DMX_SLOTS, last); s++) {
      const list = map.get(s);
      if (list) list.push(f.id);
      else map.set(s, [f.id]);
    }
  }
  return map;
}

/** First address >= `from` where `footprint` free slots fit, or null if none. */
export function nextFreeAddress(
  fixtures: FixtureInst[],
  universe: number,
  footprint: number,
  lookup: ProfileLookup,
  from = 1,
): number | null {
  const used = occupancy(fixtures, universe, lookup);
  for (let a = Math.max(1, from); a + footprint - 1 <= DMX_SLOTS; a++) {
    let ok = true;
    for (let s = a; s < a + footprint; s++) {
      if (used.has(s)) {
        ok = false;
        a = s; // jump past the blocker
        break;
      }
    }
    if (ok) return a;
  }
  return null;
}

/**
 * Addresses for `count` identical fixtures laid back to back from `start`, optionally
 * leaving `gap` free slots between them. Returns as many as fit before slot 512.
 */
export function sequentialAddresses(
  start: number,
  footprint: number,
  count: number,
  gap = 0,
): number[] {
  const out: number[] = [];
  let a = start;
  for (let i = 0; i < count && fitsUniverse(a, footprint); i++) {
    out.push(a);
    a += footprint + gap;
  }
  return out;
}

export const formatRange = (s: Pick<Span, 'first' | 'last'>) =>
  s.first === s.last ? String(s.first) : `${s.first}–${s.last}`;
