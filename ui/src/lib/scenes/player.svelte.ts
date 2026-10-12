import { mixer } from '../mixer.svelte';
import { Fade } from './fade';
import { sceneTarget, type Scene } from './model';

const FRAME_MS = 33; // ~30 fps; the mixer sends to olad at its own pace

// Fires scenes onto the mixer: fades (go) and momentary overlays (bump).
class ScenePlayer {
  fadingId = $state<string | null>(null);
  progress = $state(0);
  bumpId = $state<string | null>(null);

  #fade: Fade | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #editSeq = 0;

  /** Fade the mixer to the scene over its fade time (instantly if 0). */
  async go(scene: Scene) {
    this.stop();
    if (mixer.universe !== scene.universe) await mixer.selectUniverse(scene.universe);
    const target = sceneTarget(scene, mixer.levels);
    if (scene.fade <= 0) {
      mixer.applyLevels(target);
      return;
    }
    this.#fade = new Fade(mixer.levels, target, scene.fade * 1000, performance.now());
    this.#editSeq = mixer.editSeq;
    this.fadingId = scene.id;
    this.progress = 0;
    this.#timer = setInterval(() => this.#step(), FRAME_MS);
  }

  #step() {
    if (!this.#fade) return;
    // Moving a fader by hand takes over from the fade.
    if (mixer.editSeq !== this.#editSeq) {
      this.stop();
      return;
    }
    const frame = this.#fade.frame(performance.now());
    mixer.applyLevels(frame.levels);
    this.progress = frame.progress;
    if (frame.done) this.stop();
  }

  /** Stop a running fade, leaving the levels where they are. */
  stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#fade = null;
    this.fadingId = null;
    this.progress = 0;
  }

  /** Hold the scene's channels on top of the mix until bumpOff(). */
  bumpOn(scene: Scene) {
    if (scene.universe !== mixer.universe) return;
    this.bumpId = scene.id;
    mixer.setBump(new Map(scene.levels));
  }

  bumpOff() {
    this.bumpId = null;
    mixer.setBump(null);
  }
}

export const player = new ScenePlayer();
