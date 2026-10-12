import { describe, expect, it } from 'vitest';
import { channelTint, parseOfl } from './ofl';

const sample = {
  name: 'Mover 250',
  availableChannels: {
    Dimmer: { capability: { type: 'Intensity' } },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
    Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan' } },
    Gobo: { capabilities: [{ type: 'WheelSlot' }, { type: 'WheelRotation' }] },
  },
  modes: [
    { name: '5ch', channels: ['Dimmer', 'Red', 'Pan', 'Pan fine', null] },
    { name: 'Matrix', channels: ['Dimmer', { insertBlock: ['matrixChannels'] }] },
  ],
};

describe('parseOfl', () => {
  const r = parseOfl(sample, 'Acme', 'acme/mover-250');

  it('builds the profile identity', () => {
    expect(r.profile.id).toBe('ofl:acme/mover-250');
    expect(r.profile.manufacturer).toBe('Acme');
    expect(r.profile.source).toBe('ofl');
  });
  it('maps channel types, colours, fine aliases and unused slots', () => {
    const ch = r.profile.modes[0].channels;
    expect(ch.map((c) => c.type)).toEqual(['Intensity', 'ColorIntensity', 'Pan', 'Pan', 'NoFunction']);
    expect(ch[1].color).toBe('Red');
    expect(ch[3]).toMatchObject({ name: 'Pan fine', fine: true });
  });
  it('keeps the channel count intact (footprint)', () => {
    expect(r.profile.modes[0].channels).toHaveLength(5);
  });
  it('skips matrix modes and reports them', () => {
    expect(r.profile.modes).toHaveLength(1);
    expect(r.skippedModes).toEqual(['Matrix']);
  });
  it('rejects things that are not fixtures', () => {
    expect(() => parseOfl({ foo: 1 }, 'x', 'y')).toThrow(/Open Fixture Library/);
    expect(() => parseOfl({ name: 'a', modes: [{ name: 'm', channels: [{ insertBlock: [] }] }] }, 'x', 'y')).toThrow(/matrix/);
  });
});

describe('channelTint', () => {
  it('tints colour channels only', () => {
    expect(channelTint({ name: 'Red', type: 'ColorIntensity', color: 'Red' })).toBeTruthy();
    expect(channelTint({ name: 'Dimmer', type: 'Intensity' })).toBeUndefined();
  });
});
