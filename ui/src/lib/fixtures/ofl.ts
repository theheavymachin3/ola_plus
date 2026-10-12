// Parse an Open Fixture Library fixture JSON into our Profile. Pure; no network.
import type { ChannelDef, Mode, Profile } from './model';

interface OflCapability {
  type?: string;
  color?: string;
}
interface OflChannel {
  capability?: OflCapability;
  capabilities?: OflCapability[];
  fineChannelAliases?: string[];
}
interface OflFixture {
  name?: string;
  availableChannels?: Record<string, OflChannel>;
  modes?: { name?: string; channels?: unknown[] }[];
}

export interface OflResult {
  profile: Profile;
  skippedModes: string[]; // modes using matrix blocks we can't expand yet
}

export function parseOfl(json: unknown, manufacturer: string, key: string): OflResult {
  const f = json as OflFixture;
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !Array.isArray(f.modes)) {
    throw new Error('Not an Open Fixture Library fixture file.');
  }
  const channels = f.availableChannels ?? {};

  // Fine (16-bit low byte) aliases point back at their coarse channel.
  const fineOf = new Map<string, string>();
  for (const [name, ch] of Object.entries(channels)) {
    for (const alias of ch.fineChannelAliases ?? []) fineOf.set(alias, name);
  }

  const describe = (name: string): ChannelDef => {
    const fine = fineOf.get(name);
    const ch = channels[fine ?? name];
    const cap = ch?.capability ?? ch?.capabilities?.[0];
    const def: ChannelDef = { name, type: cap?.type ?? 'Other' };
    if (cap?.color) def.color = cap.color;
    if (fine) def.fine = true;
    return def;
  };

  const modes: Mode[] = [];
  const skippedModes: string[] = [];
  for (const m of f.modes) {
    const name = m.name ?? `Mode ${modes.length + 1}`;
    const list = m.channels ?? [];
    // Matrix modes carry { insertBlock } objects whose size we don't expand here.
    if (list.some((c) => c !== null && typeof c !== 'string')) {
      skippedModes.push(name);
      continue;
    }
    modes.push({
      name,
      channels: list.map((c) => (c === null ? { name: '(unused)', type: 'NoFunction' } : describe(c as string))),
    });
  }
  if (!modes.length) throw new Error('This fixture only has matrix modes, which are not supported yet.');

  return {
    profile: { id: `ofl:${key}`, manufacturer, name: f.name, source: 'ofl', modes },
    skippedModes,
  };
}

const TINTS: Record<string, string> = {
  Red: '#e5484d', Green: '#3fb950', Blue: '#3b82f6', White: '#e6edf3', 'Warm White': '#f5d9a0',
  'Cold White': '#c9e4ff', Amber: '#e8a317', UV: '#8b5cf6', Cyan: '#22d3ee', Magenta: '#e879f9',
  Yellow: '#facc15', Lime: '#a3e635', Indigo: '#6366f1',
};

/** Fader tint for a channel (colour channels get their colour, everything else is neutral). */
export function channelTint(c: ChannelDef): string | undefined {
  return c.type === 'ColorIntensity' && c.color ? TINTS[c.color] : undefined;
}
