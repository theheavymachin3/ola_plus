// Pure RDM logic: DMX address ranges, overlaps and the "address everything in a row" plan.
// No I/O here.

export interface Personality {
  index: number; // 1-based, as RDM numbers them
  name: string;
  footprint: number;
}

export interface RdmDevice {
  uid: string; // "7a70:00000001"
  manufacturer: string;
  label: string; // the device label olad resolved, may be empty
  address: number | null; // DMX start address; null until read, or when the device has no footprint
  footprint: number | null;
  personality: number | null;
  personalityCount: number | null;
  personalities: Personality[] | null; // loaded on demand
  identify: boolean | null;
  busy: boolean;
  error: string;
}

export const MAX_ADDRESS = 512;

export function newDevice(uid: string, manufacturer = '', label = ''): RdmDevice {
  return {
    uid,
    manufacturer,
    label,
    address: null,
    footprint: null,
    personality: null,
    personalityCount: null,
    personalities: null,
    identify: null,
    busy: false,
    error: '',
  };
}

/** UIDs sort by manufacturer id, then device id (both hex), like RDM itself orders them. */
export function compareUid(a: string, b: string): number {
  const [am, ad] = a.split(':');
  const [bm, bd] = b.split(':');
  return parseInt(am, 16) - parseInt(bm, 16) || parseInt(ad, 16) - parseInt(bd, 16);
}

export function displayName(d: RdmDevice): string {
  return d.label || d.manufacturer || d.uid;
}

/** Why `address` can't be used for a device with this footprint, or null if it can. */
export function validateAddress(address: number, footprint: number | null): string | null {
  if (!Number.isInteger(address) || address < 1 || address > MAX_ADDRESS) {
    return `The address must be a whole number from 1 to ${MAX_ADDRESS}.`;
  }
  if (footprint && address + footprint - 1 > MAX_ADDRESS) {
    return `Needs ${footprint} channels: the last address that fits is ${MAX_ADDRESS - footprint + 1}.`;
  }
  return null;
}

export interface Span {
  uid: string;
  start: number;
  end: number; // inclusive
}

/** The channels a device occupies, or null if it has no address or no footprint. */
export function spanOf(d: RdmDevice): Span | null {
  if (d.address === null || !d.footprint) return null;
  return { uid: d.uid, start: d.address, end: d.address + d.footprint - 1 };
}

/** Devices in address order (those without an address last, by UID). */
export function byAddress(devices: RdmDevice[]): RdmDevice[] {
  return [...devices].sort((a, b) => {
    if (a.address === null && b.address === null) return compareUid(a.uid, b.uid);
    if (a.address === null) return 1;
    if (b.address === null) return -1;
    return a.address - b.address || compareUid(a.uid, b.uid);
  });
}

/** UIDs whose channels overlap another device's. */
export function overlapping(devices: RdmDevice[]): Set<string> {
  const spans = devices.map(spanOf).filter((s): s is Span => s !== null).sort((a, b) => a.start - b.start);
  const out = new Set<string>();
  // After sorting by start, a span can only overlap the ones still "open" when it starts.
  let open: Span[] = [];
  for (const s of spans) {
    open = open.filter((o) => o.end >= s.start);
    for (const o of open) {
      out.add(o.uid);
      out.add(s.uid);
    }
    open.push(s);
  }
  return out;
}

export interface AddressChange {
  uid: string;
  from: number | null;
  to: number;
}

export interface AddressPlan {
  changes: AddressChange[];
  /** Devices that would not fit below 512; they are left alone. */
  overflow: string[];
}

/**
 * Lay the devices end to end from `start`, leaving `gap` free channels between them, in their
 * current address order. Only devices whose address would change are listed.
 */
export function planSequential(devices: RdmDevice[], start: number, gap: number): AddressPlan {
  const changes: AddressChange[] = [];
  const overflow: string[] = [];
  let next = start;
  for (const d of byAddress(devices)) {
    if (!d.footprint) continue; // nothing to address (or not read yet)
    if (next + d.footprint - 1 > MAX_ADDRESS) {
      overflow.push(d.uid);
      continue;
    }
    if (d.address !== next) changes.push({ uid: d.uid, from: d.address, to: next });
    next += d.footprint + gap;
  }
  return { changes, overflow };
}
