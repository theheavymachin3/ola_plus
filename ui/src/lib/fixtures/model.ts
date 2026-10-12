// Fixture-level patch model. A Profile describes a fixture type (channels per mode);
// a FixtureInst is one physical unit placed at an address on a universe.

export interface ChannelDef {
  name: string;
  type: string; // OFL capability type: Intensity, ColorIntensity, Pan, Tilt, ... or "Other"
  color?: string; // for ColorIntensity: Red, Green, Blue, ...
  fine?: boolean; // low byte of a 16-bit channel
}

export interface Mode {
  name: string;
  channels: ChannelDef[];
}

export type ProfileSource = 'builtin' | 'ofl' | 'custom';

export interface Profile {
  id: string;
  manufacturer: string;
  name: string;
  source: ProfileSource;
  modes: Mode[];
}

export interface FixtureInst {
  id: string;
  name: string;
  profileId: string;
  mode: number; // index into profile.modes
  universe: number;
  address: number; // 1..512
}

export const DMX_SLOTS = 512;

export function footprintOf(profile: Profile | undefined, mode: number): number {
  return profile?.modes[mode]?.channels.length ?? 0;
}

export const profileLabel = (p: Profile) =>
  p.manufacturer ? `${p.manufacturer} ${p.name}` : p.name;
