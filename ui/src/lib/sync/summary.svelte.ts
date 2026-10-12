import { fixtureStore } from '../fixtures/store.svelte';
import { sceneStore } from '../scenes/store.svelte';
import type { SyncStatus } from './docSync';

const CONFLICT_NOTICE_MS = 8000;

export interface SyncSummary {
  state: SyncStatus;
  label: string;
  hint: string;
}

const docs = () => [fixtureStore.profileDoc, fixtureStore.fixtureDoc, sceneStore.doc];

/** One line about where the user's rig and scenes are kept, for the header. */
export function syncSummary(now: number): SyncSummary {
  const all = docs();
  const statuses = all.map((d) => d.status);
  if (all.some((d) => now - d.conflictAt < CONFLICT_NOTICE_MS)) {
    return {
      state: 'conflict',
      label: 'Updated from another device',
      hint: 'Someone saved first, so their version was loaded. Your last change was not applied.',
    };
  }
  if (statuses.includes('offline')) {
    return { state: 'offline', label: 'Offline', hint: 'Cannot reach olad. Changes are kept and will be saved when it is back.' };
  }
  if (statuses.includes('saving')) {
    return { state: 'saving', label: 'Saving…', hint: 'Saving to olad.' };
  }
  if (statuses.every((s) => s === 'local')) {
    return {
      state: 'local',
      label: 'This device only',
      hint: 'This olad has no shared storage (it needs an OLA Plus build). Fixtures and scenes stay in this browser.',
    };
  }
  return { state: 'synced', label: 'Saved on olad', hint: 'Fixtures and scenes are stored on olad and shared by every device.' };
}
