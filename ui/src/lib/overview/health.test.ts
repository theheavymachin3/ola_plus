import { describe, expect, it } from 'vitest';
import type { SystemStats } from '../api';
import { decodeThrottled, formatUptime, hostNotices, memoryUsedPercent, tempLevel } from './health';

const pi = (over: Partial<SystemStats> = {}): SystemStats => ({ platform: 'raspberry-pi', ...over });

describe('decodeThrottled', () => {
  it('reads 0x50005 as under-voltage and throttled, now and in the past', () => {
    expect(decodeThrottled(0x50005)).toEqual({
      now: ['under-voltage', 'throttled'],
      past: ['under-voltage', 'throttled'],
    });
  });
  it('is empty for 0', () => {
    expect(decodeThrottled(0)).toEqual({ now: [], past: [] });
  });
  it('tells a past event from a current one', () => {
    expect(decodeThrottled(0x10000)).toEqual({ now: [], past: ['under-voltage'] });
  });
});

describe('tempLevel', () => {
  it('has thresholds at 70 and 80', () => {
    expect(tempLevel(69.9)).toBe('ok');
    expect(tempLevel(70)).toBe('warn');
    expect(tempLevel(80)).toBe('bad');
  });
});

describe('hostNotices', () => {
  it('is quiet for a healthy host and when there is no data', () => {
    expect(hostNotices(null)).toEqual([]);
    expect(hostNotices(pi({ cpu_temp_c: 50, firmware: { age_s: 1, volts: {}, throttled: 0 } }))).toEqual([]);
  });
  it('warns about under-voltage right now, from either source', () => {
    expect(hostNotices(pi({ undervoltage_alarm: true }))[0].severity).toBe('warn');
    const n = hostNotices(pi({ firmware: { age_s: 1, volts: {}, throttled: 0x1 } }));
    expect(n[0].text).toMatch(/under-voltage right now/);
  });
  it('only informs about an earlier under-voltage', () => {
    const n = hostNotices(pi({ firmware: { age_s: 1, volts: {}, throttled: 0x10000 } }));
    expect(n).toHaveLength(1);
    expect(n[0].severity).toBe('info');
  });
  it('reports 0x50005 as the live problem and the throttling', () => {
    const n = hostNotices(pi({ firmware: { age_s: 1, volts: {}, throttled: 0x50005 } }));
    expect(n.map((x) => x.severity)).toEqual(['warn', 'warn']);
  });
  it('warns about heat', () => {
    expect(hostNotices(pi({ cpu_temp_c: 72 }))[0].severity).toBe('info');
    expect(hostNotices(pi({ cpu_temp_c: 81.2 }))[0]).toMatchObject({ severity: 'warn' });
  });
});

describe('formatting', () => {
  it('formats uptime', () => {
    expect(formatUptime(59)).toBe('0m');
    expect(formatUptime(3700)).toBe('1h 1m');
    expect(formatUptime(90000)).toBe('1d 1h');
  });
  it('computes memory use', () => {
    expect(memoryUsedPercent(pi({ mem_total_kb: 1000, mem_available_kb: 250 }))).toBe(75);
    expect(memoryUsedPercent(pi())).toBeNull();
  });
});
