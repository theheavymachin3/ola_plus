import { describe, expect, it } from 'vitest';
import { Fade } from './fade';
import {
  clampFade,
  composeOutput,
  lerpLevels,
  recordLevels,
  sceneMatches,
  sceneTarget,
  SLOTS,
  type Scene,
} from './model';

const zeros = () => new Array<number>(SLOTS).fill(0);
const withLevels = (pairs: [number, number][]) => {
  const a = zeros();
  for (const [c, v] of pairs) a[c] = v;
  return a;
};
const scene = (levels: [number, number][], replace = true): Pick<Scene, 'levels' | 'replace'> => ({ levels, replace });

describe('recordLevels', () => {
  it('keeps only lit channels, rounded and capped', () => {
    expect(recordLevels(withLevels([[0, 255], [5, 12.4], [9, 300]]))).toEqual([[0, 255], [5, 12], [9, 255]]);
  });
  it('is empty for a dark stage', () => {
    expect(recordLevels(zeros())).toEqual([]);
  });
});

describe('sceneTarget', () => {
  const now = withLevels([[0, 100], [1, 50]]);
  it('a look sends everything else to zero', () => {
    const t = sceneTarget(scene([[1, 200], [2, 10]]), now);
    expect(t[0]).toBe(0);
    expect(t[1]).toBe(200);
    expect(t[2]).toBe(10);
  });
  it('an accent leaves other channels alone', () => {
    const t = sceneTarget(scene([[1, 200]], false), now);
    expect(t[0]).toBe(100);
    expect(t[1]).toBe(200);
  });
  it('an empty look is a blackout target', () => {
    expect(sceneTarget(scene([]), now)).toEqual(zeros());
  });
});

describe('sceneMatches', () => {
  it('a look matches only when nothing else is lit', () => {
    const s = scene([[1, 200]]);
    expect(sceneMatches(s, withLevels([[1, 200]]))).toBe(true);
    expect(sceneMatches(s, withLevels([[1, 200], [3, 1]]))).toBe(false);
    expect(sceneMatches(s, withLevels([[1, 199]]))).toBe(false);
  });
  it('an accent ignores channels it does not own', () => {
    const s = scene([[1, 200]], false);
    expect(sceneMatches(s, withLevels([[1, 200], [3, 99]]))).toBe(true);
    expect(sceneMatches(s, withLevels([[3, 99]]))).toBe(false);
  });
});

describe('lerpLevels / Fade', () => {
  const from = withLevels([[0, 0], [1, 200]]);
  const to = withLevels([[0, 100], [1, 0]]);
  it('blends and clamps t', () => {
    const half = lerpLevels(from, to, 0.5);
    expect([half[0], half[1]]).toEqual([50, 100]);
    expect(lerpLevels(from, to, -1)[1]).toBe(200);
    expect(lerpLevels(from, to, 5)[0]).toBe(100);
  });
  it('reports progress from the supplied clock', () => {
    const f = new Fade(from, to, 2000, 1000);
    expect(f.frame(1000)).toMatchObject({ progress: 0, done: false });
    const mid = f.frame(2000);
    expect(mid.progress).toBe(0.5);
    expect(mid.levels[0]).toBe(50);
    expect(f.frame(3000)).toMatchObject({ progress: 1, done: true });
    expect(f.frame(9999).levels[0]).toBe(100);
  });
  it('a zero length fade is already done', () => {
    expect(new Fade(from, to, 0, 0).frame(0).done).toBe(true);
  });
  it('copies its inputs so later edits cannot change the fade', () => {
    const a = zeros();
    const f = new Fade(a, to, 1000, 0);
    a[0] = 255;
    expect(f.frame(0).levels[0]).toBe(0);
  });
});

describe('composeOutput', () => {
  const levels = withLevels([[0, 200], [1, 100]]);
  it('scales by master', () => {
    const o = composeOutput(levels, 50, false, null);
    expect([o[0], o[1]]).toEqual([100, 50]);
  });
  it('lets a bump win only where it is higher (HTP), ignoring master', () => {
    const o = composeOutput(levels, 50, false, new Map([[0, 60], [1, 255], [2, 40]]));
    expect([o[0], o[1], o[2]]).toEqual([100, 255, 40]);
  });
  it('blackout silences levels and bumps alike', () => {
    expect(composeOutput(levels, 100, true, new Map([[0, 255]]))).toEqual(zeros());
  });
  it('ignores bump channels outside the universe', () => {
    expect(composeOutput(zeros(), 100, false, new Map([[999, 255]]))).toHaveLength(SLOTS);
  });
});

describe('clampFade', () => {
  it('keeps fade times sane', () => {
    expect(clampFade(-3)).toBe(0);
    expect(clampFade(2.46)).toBe(2.5);
    expect(clampFade(9999)).toBe(120);
    expect(clampFade(NaN)).toBe(0);
  });
});
