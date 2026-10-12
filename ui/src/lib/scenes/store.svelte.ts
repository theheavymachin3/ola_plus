import { newId } from '../id';
import { mergeById } from '../sync/merge';
import { RemoteDoc } from '../sync/remoteDoc.svelte';
import { clampFade, type Scene } from './model';

// Shared through olad's UI store (every device sees the same scenes); the localStorage copy
// under the same key as before means scenes recorded before sharing existed are published
// the first time an OLA Plus olad is reached.
class SceneStore {
  readonly doc = new RemoteDoc<Scene[]>('scenes', 'olaplus.scenes', [], (v) => v.length === 0, mergeById);

  get scenes(): Scene[] {
    return Array.isArray(this.doc.data) ? this.doc.data : [];
  }

  start() {
    this.doc.start();
  }

  inUniverse(universe: number): Scene[] {
    return this.scenes.filter((s) => s.universe === universe);
  }

  countIn(universe: number): number {
    return this.inUniverse(universe).length;
  }

  nextName(universe: number): string {
    return `Scene ${this.countIn(universe) + 1}`;
  }

  add(scene: Omit<Scene, 'id'>): Scene {
    const created: Scene = { ...scene, id: newId(), fade: clampFade(scene.fade) };
    this.doc.set([...this.scenes, created]);
    return created;
  }

  update(id: string, changes: Partial<Omit<Scene, 'id'>>) {
    this.doc.set(
      this.scenes.map((s) => (s.id === id ? { ...s, ...changes, fade: clampFade(changes.fade ?? s.fade) } : s)),
    );
  }

  remove(id: string) {
    this.doc.set(this.scenes.filter((s) => s.id !== id));
  }
}

export const sceneStore = new SceneStore();
