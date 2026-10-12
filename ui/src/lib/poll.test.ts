import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './poll';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startPolling', () => {
  it('runs immediately and then on the interval', async () => {
    const task = vi.fn(async () => {});
    const stop = startPolling(task, 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(task).toHaveBeenCalledTimes(3);
    stop();
  });

  it('never overlaps a slow task', async () => {
    let active = 0;
    let maxActive = 0;
    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 450));
      active--;
    };
    const stop = startPolling(task, 100);
    await vi.advanceTimersByTimeAsync(1500);
    stop();
    expect(maxActive).toBe(1);
  });

  it('survives a failing task and stops when told', async () => {
    const task = vi.fn(async () => {
      throw new Error('nope');
    });
    const stop = startPolling(task, 100);
    await vi.advanceTimersByTimeAsync(350);
    expect(task.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
    const before = task.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(task.mock.calls.length).toBe(before);
  });
});
