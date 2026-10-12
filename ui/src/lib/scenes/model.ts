// Scene model and the pure maths around it. No I/O, no timers.

export const SLOTS = 512;

export interface Scene {
  id: string;
  name: string;
  universe: number;
  /** [channel index 0..511, value 1..255] for every channel that was lit when recorded. */
  levels: [number, number][];
  /** Seconds to fade in when the scene is fired. 0 snaps. */
  fade: number;
  /**
   * true: a "look" - channels not in the scene fade to 0.
   * false: an "accent" - only the scene's own channels are touched.
   */
  replace: boolean;
}

export const MAX_FADE_SECONDS = 120;

export const clampFade = (s: number) =>
  Number.isFinite(s) ? Math.min(MAX_FADE_SECONDS, Math.max(0, Math.round(s * 10) / 10)) : 0;

/** Capture the lit channels of `levels` (the operator's levels, before master). */
export function recordLevels(levels: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < Math.min(SLOTS, levels.length); i++) {
    const v = Math.round(levels[i]);
    if (v > 0) out.push([i, Math.min(255, v)]);
  }
  return out;
}

/** The levels a scene aims for, given what is on stage now. */
export function sceneTarget(scene: Pick<Scene, 'levels' | 'replace'>, current: ArrayLike<number>): number[] {
  const target = scene.replace
    ? new Array<number>(SLOTS).fill(0)
    : Array.from({ length: SLOTS }, (_, i) => current[i] ?? 0);
  for (const [ch, v] of scene.levels) if (ch >= 0 && ch < SLOTS) target[ch] = v;
  return target;
}

/** True when `levels` is exactly where firing the scene would leave things. */
export function sceneMatches(scene: Pick<Scene, 'levels' | 'replace'>, levels: ArrayLike<number>): boolean {
  const own = new Map(scene.levels);
  if (scene.replace) {
    for (let i = 0; i < SLOTS; i++) if ((levels[i] ?? 0) !== (own.get(i) ?? 0)) return false;
    return true;
  }
  for (const [ch, v] of own) if ((levels[ch] ?? 0) !== v) return false;
  return true;
}

/** Linear blend of two level arrays; t is clamped to 0..1. */
export function lerpLevels(from: ArrayLike<number>, to: ArrayLike<number>, t: number): number[] {
  const k = Math.min(1, Math.max(0, t));
  const out = new Array<number>(SLOTS);
  for (let i = 0; i < SLOTS; i++) {
    const a = from[i] ?? 0;
    out[i] = Math.round(a + ((to[i] ?? 0) - a) * k);
  }
  return out;
}

/**
 * What actually goes to olad: operator levels scaled by master, with any bump held on top
 * (highest value wins). Blackout silences everything, bumps included.
 */
export function composeOutput(
  levels: ArrayLike<number>,
  master: number,
  blackout: boolean,
  bump: ReadonlyMap<number, number> | null,
): number[] {
  const k = blackout ? 0 : master / 100;
  const out = new Array<number>(SLOTS);
  for (let i = 0; i < SLOTS; i++) out[i] = Math.round((levels[i] ?? 0) * k);
  if (!blackout && bump) {
    for (const [ch, v] of bump) if (ch >= 0 && ch < SLOTS) out[ch] = Math.max(out[ch], v);
  }
  return out;
}
