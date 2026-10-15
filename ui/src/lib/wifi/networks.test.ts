import { describe, expect, it } from 'vitest';
import type { WifiNetwork } from '../api';
import { isEnterprise, isOpen, listNetworks, securityLabel, validPassphrase } from './networks';

const net = (ssid: string, signal: number, security = 'WPA2', in_use = false): WifiNetwork => ({ ssid, signal, security, in_use });

describe('listNetworks', () => {
  it('lists a network once, at its best signal, strongest first', () => {
    const out = listNetworks([net('A', 30), net('B', 80), net('A', 60)]);
    expect(out.map((n) => [n.ssid, n.signal])).toEqual([['B', 80], ['A', 60]]);
  });

  it('puts the connected network first, even when weaker', () => {
    const out = listNetworks([net('A', 90), net('B', 20, 'WPA2', true), net('B', 10)]);
    expect(out.map((n) => n.ssid)).toEqual(['B', 'A']);
    expect(out[0].in_use).toBe(true);
  });
});

describe('security', () => {
  it('tells open, personal and enterprise apart', () => {
    expect(isOpen('--')).toBe(true);
    expect(isOpen('WPA3')).toBe(false);
    expect(isEnterprise('WPA2 802.1X')).toBe(true);
    expect(securityLabel('--')).toBe('Open');
    expect(securityLabel('WPA2 WPA3')).toBe('WPA2 WPA3');
    expect(securityLabel('WPA2 802.1X')).toBe('Enterprise');
  });

  it('accepts 8 to 63 character passphrases', () => {
    expect(validPassphrase('1234567')).toBe(false);
    expect(validPassphrase('12345678')).toBe(true);
    expect(validPassphrase('x'.repeat(63))).toBe(true);
    expect(validPassphrase('x'.repeat(64))).toBe(false);
  });
});
