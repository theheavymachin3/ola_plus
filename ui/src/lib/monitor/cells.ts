// Pure helpers for the channel monitor: how a value is written, how bright a cell is, how many
// columns fit, and which fixture a channel belongs to.
import { spanOf, type ProfileLookup } from '../fixtures/addressing';
import type { FixtureInst } from '../fixtures/model';

export type ValueMode = 'dec' | 'pct' | 'hex';

export function formatValue(v: number, mode: ValueMode): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  if (mode === 'hex') return n.toString(16).toUpperCase().padStart(2, '0');
  if (mode === 'pct') return String(Math.round((n / 255) * 100));
  return String(n);
}

/** Cell brightness 0..1. Dark cells stay distinguishable from lit ones even at value 1. */
export function heat(v: number): number {
  if (v <= 0) return 0;
  return 0.12 + 0.88 * (Math.min(255, v) / 255);
}

/** Columns for a grid of 512 channels in `width` CSS pixels: always divides 512 evenly. */
export function columnsFor(width: number): number {
  if (width >= 900) return 32;
  if (width >= 520) return 16;
  return 8;
}

export interface ChannelOwner {
  fixture: FixtureInst;
  channelName: string;
}

/** The fixture (and its channel's name) that uses 0-based channel `ch` on `universe`, if any. */
export function ownerOf(
  ch: number,
  universe: number,
  fixtures: FixtureInst[],
  lookup: ProfileLookup,
): ChannelOwner | null {
  for (const f of fixtures) {
    if (f.universe !== universe) continue;
    const { first, last } = spanOf(f, lookup);
    const slot = ch + 1; // addresses are 1-based
    if (slot < first || slot > last) continue;
    const name = lookup(f.profileId)?.modes[f.mode]?.channels[slot - first]?.name;
    return { fixture: f, channelName: name ?? `Channel ${slot - first + 1}` };
  }
  return null;
}

/** Channels whose value differs between two snapshots (for the change flash). */
export function changedChannels(prev: ArrayLike<number> | null, next: ArrayLike<number>): number[] {
  if (!prev) return [];
  const out: number[] = [];
  for (let i = 0; i < next.length; i++) if ((prev[i] ?? 0) !== next[i]) out.push(i);
  return out;
}
