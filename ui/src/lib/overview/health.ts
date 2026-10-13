// What the host readings mean, in plain words. No I/O.
import type { SystemStats } from '../api';

export type Level = 'ok' | 'warn' | 'bad';

/** A Raspberry Pi starts slowing itself down at 80 °C (some models already at 60 °C under load). */
export const TEMP_WARN_C = 70;
export const TEMP_BAD_C = 80;

export function tempLevel(c: number): Level {
  return c >= TEMP_BAD_C ? 'bad' : c >= TEMP_WARN_C ? 'warn' : 'ok';
}

export interface ThrottleFlags {
  /** Happening right now. */
  now: string[];
  /** Happened at some point since the Raspberry booted (and is not necessarily happening now). */
  past: string[];
}

const NOW_BITS: [number, string][] = [
  [0x1, 'under-voltage'],
  [0x2, 'ARM frequency capped'],
  [0x4, 'throttled'],
  [0x8, 'soft temperature limit'],
];
const PAST_BITS: [number, string][] = [
  [0x10000, 'under-voltage'],
  [0x20000, 'ARM frequency capped'],
  [0x40000, 'throttled'],
  [0x80000, 'soft temperature limit'],
];

/** Decodes the `vcgencmd get_throttled` bit field. */
export function decodeThrottled(bits: number): ThrottleFlags {
  const pick = (table: [number, string][]) => table.filter(([mask]) => (bits & mask) !== 0).map(([, name]) => name);
  return { now: pick(NOW_BITS), past: pick(PAST_BITS) };
}

export function memoryUsedPercent(s: SystemStats): number | null {
  if (!s.mem_total_kb || s.mem_available_kb === undefined) return null;
  return Math.round(((s.mem_total_kb - s.mem_available_kb) / s.mem_total_kb) * 100);
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export interface HostNotice {
  severity: 'warn' | 'info';
  text: string;
}

/** The power and heat problems worth interrupting the operator for. */
export function hostNotices(s: SystemStats | null | undefined): HostNotice[] {
  if (!s) return [];
  const out: HostNotice[] = [];
  const flags = s.firmware?.throttled !== undefined ? decodeThrottled(s.firmware.throttled) : null;
  const underNow = s.undervoltage_alarm === true || (flags?.now.includes('under-voltage') ?? false);
  if (underNow) {
    out.push({
      severity: 'warn',
      text: 'The Raspberry Pi reports under-voltage right now: check its power supply and cable. DMX/USB output can be disturbed.',
    });
  } else if (flags?.past.includes('under-voltage')) {
    out.push({
      severity: 'info',
      text: 'The Raspberry Pi had an under-voltage event since it booted: check its power supply and cable.',
    });
  }
  if (flags?.now.includes('throttled')) {
    out.push({ severity: 'warn', text: 'The Raspberry Pi is throttling its CPU right now.' });
  }
  if (s.cpu_temp_c !== undefined) {
    const level = tempLevel(s.cpu_temp_c);
    if (level !== 'ok') {
      out.push({
        severity: level === 'bad' ? 'warn' : 'info',
        text: `CPU temperature is ${s.cpu_temp_c.toFixed(1)} °C${level === 'bad' ? ': the Raspberry Pi will slow itself down' : ''}.`,
      });
    }
  }
  return out;
}
