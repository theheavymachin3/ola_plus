import type { WifiNetwork } from '../api';

/** One row per network name (a network with several access points is listed once, at its best
 *  signal), the one we are connected to first, then strongest first. */
export function listNetworks(raw: WifiNetwork[]): WifiNetwork[] {
  const best = new Map<string, WifiNetwork>();
  for (const n of raw) {
    const have = best.get(n.ssid);
    if (!have) best.set(n.ssid, { ...n });
    else {
      have.in_use = have.in_use || n.in_use;
      if (n.signal > have.signal) {
        have.signal = n.signal;
        have.security = n.security;
      }
    }
  }
  return [...best.values()].sort((a, b) => Number(b.in_use) - Number(a.in_use) || b.signal - a.signal);
}

export const isOpen = (security: string) => security === '' || security === '--';

/** Company networks (802.1X / EAP) need a user name and certificates, which this can't enter. */
export const isEnterprise = (security: string) => security.includes('802.1X');

/** WPA/WPA2/WPA3 personal passphrases are 8 to 63 characters. */
export const validPassphrase = (p: string) => p.length >= 8 && p.length <= 63;

export function securityLabel(security: string): string {
  if (isOpen(security)) return 'Open';
  if (isEnterprise(security)) return 'Enterprise';
  return security;
}
