// Groups: a named set of fixtures and/or raw channels with one master fader (0-100%) that
// scales them. Pure logic; the reactive wiring lives in groups/store.svelte.ts.
import { spanOf, type ProfileLookup } from '../fixtures/addressing';
import { DMX_SLOTS, type FixtureInst } from '../fixtures/model';

export interface Group {
  id: string;
  name: string;
  universe: number;
  /** Fixtures in the group; their channels follow them if they are re-addressed. */
  fixtureIds: string[];
  /** Extra raw channels, 0-based (shown to people as 1-based). */
  channels: number[];
}

/** Every channel (0-based, sorted, unique) the group controls on its universe. */
export function groupChannels(group: Group, fixtures: FixtureInst[], lookup: ProfileLookup): number[] {
  const set = new Set<number>();
  for (const id of group.fixtureIds) {
    const f = fixtures.find((x) => x.id === id && x.universe === group.universe);
    if (!f) continue;
    const { first, last } = spanOf(f, lookup);
    for (let ch = Math.max(1, first); ch <= Math.min(DMX_SLOTS, last); ch++) set.add(ch - 1);
  }
  for (const ch of group.channels) if (ch >= 0 && ch < DMX_SLOTS) set.add(ch);
  return [...set].sort((a, b) => a - b);
}

/**
 * Per-channel multiplier (0..1) from the groups on `universe` at their current levels
 * (percent, default 100). A channel in several groups gets the product. Channels at full
 * are left out so the map is empty when nothing is pulled down.
 */
export function buildScale(
  groups: Group[],
  levels: Readonly<Record<string, number>>,
  universe: number,
  fixtures: FixtureInst[],
  lookup: ProfileLookup,
): Map<number, number> {
  const scale = new Map<number, number>();
  for (const g of groups) {
    if (g.universe !== universe) continue;
    const factor = Math.min(100, Math.max(0, levels[g.id] ?? 100)) / 100;
    if (factor >= 1) continue;
    for (const ch of groupChannels(g, fixtures, lookup)) scale.set(ch, (scale.get(ch) ?? 1) * factor);
  }
  return scale;
}

export type ChannelListResult = { channels: number[] } | { error: string };

/** Parse "1-16, 20 33-36" (1-based, as people write them) into sorted 0-based channels. */
export function parseChannelList(text: string): ChannelListResult {
  const set = new Set<number>();
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!m) return { error: `"${token}" is not a channel or a range like 1-16` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b > DMX_SLOTS) return { error: `Channels go from 1 to ${DMX_SLOTS}` };
    if (b < a) return { error: `"${token}" runs backwards` };
    for (let ch = a; ch <= b; ch++) set.add(ch - 1);
  }
  return { channels: [...set].sort((x, y) => x - y) };
}

/** The inverse of parseChannelList: 0-based channels as "1-16, 20". */
export function formatChannelList(channels: number[]): string {
  const sorted = [...new Set(channels)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i] + 1}-${sorted[j] + 1}` : `${sorted[i] + 1}`);
    i = j + 1;
  }
  return parts.join(', ');
}
