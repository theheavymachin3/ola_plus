import type { ChannelDef, Profile } from './model';

const dim: ChannelDef = { name: 'Dimmer', type: 'Intensity' };
const c = (color: string): ChannelDef => ({ name: color, type: 'ColorIntensity', color });
const other = (name: string, type = 'Other'): ChannelDef => ({ name, type });

// Always available so a rig can be patched before any library is imported.
export const BUILTIN_PROFILES: Profile[] = [
  {
    id: 'builtin:dimmer',
    manufacturer: 'Generic',
    name: 'Dimmer',
    source: 'builtin',
    modes: [{ name: '1ch', channels: [dim] }],
  },
  {
    id: 'builtin:led-par',
    manufacturer: 'Generic',
    name: 'LED Par',
    source: 'builtin',
    modes: [
      { name: '3ch RGB', channels: [c('Red'), c('Green'), c('Blue')] },
      { name: '4ch RGBW', channels: [c('Red'), c('Green'), c('Blue'), c('White')] },
      { name: '4ch Dimmer+RGB', channels: [dim, c('Red'), c('Green'), c('Blue')] },
      { name: '5ch Dimmer+RGBW', channels: [dim, c('Red'), c('Green'), c('Blue'), c('White')] },
      {
        name: '7ch',
        channels: [dim, c('Red'), c('Green'), c('Blue'), other('Strobe', 'ShutterStrobe'), other('Macro'), other('Speed')],
      },
    ],
  },
];
