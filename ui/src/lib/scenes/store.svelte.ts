import { newId } from '../id';
import { clampFade, type Scene } from './model';

// Saved in the browser for now (per device), like fixtures. The shape is what will move
// into olad-side storage so every phone/tablet/PC sees the same scenes.
const KEY = 'olaplus.scenes';

function load(): Scene[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Scene[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class SceneStore {
  scenes = $state<Scene[]>(load());

  inUniverse(universe: number): Scene[] {
    return this.scenes.filter((s) => s.universe === universe);
  }

  countIn(universe: number): number {
    return this.scenes.filter((s) => s.universe === universe).length;
  }

  nextName(universe: number): string {
    return `Scene ${this.countIn(universe) + 1}`;
  }

  add(scene: Omit<Scene, 'id'>): Scene {
    const created: Scene = { ...scene, id: newId(), fade: clampFade(scene.fade) };
    this.scenes = [...this.scenes, created];
    this.#save();
    return created;
  }

  update(id: string, changes: Partial<Omit<Scene, 'id'>>) {
    this.scenes = this.scenes.map((s) =>
      s.id === id ? { ...s, ...changes, fade: clampFade(changes.fade ?? s.fade) } : s,
    );
    this.#save();
  }

  remove(id: string) {
    this.scenes = this.scenes.filter((s) => s.id !== id);
    this.#save();
  }

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.scenes));
    } catch {
      /* private mode / quota: keep working in memory */
    }
  }
}

export const sceneStore = new SceneStore();
