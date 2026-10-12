import { lerpLevels } from './model';

export interface FadeFrame {
  levels: number[];
  progress: number; // 0..1
  done: boolean;
}

/**
 * A linear fade between two level arrays. Time is passed in, never read, so it is
 * deterministic and testable: call frame(now) from any timer.
 */
export class Fade {
  readonly #from: number[];
  readonly #to: number[];
  readonly #duration: number;
  readonly #start: number;

  constructor(from: ArrayLike<number>, to: ArrayLike<number>, durationMs: number, startMs: number) {
    this.#from = Array.from(from);
    this.#to = Array.from(to);
    this.#duration = Math.max(0, durationMs);
    this.#start = startMs;
  }

  frame(nowMs: number): FadeFrame {
    const progress = this.#duration === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - this.#start) / this.#duration));
    return { levels: lerpLevels(this.#from, this.#to, progress), progress, done: progress >= 1 };
  }
}
