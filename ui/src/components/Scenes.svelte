<script lang="ts">
  import { mixer } from '../lib/mixer.svelte';
  import type { Scene } from '../lib/scenes/model';
  import { player } from '../lib/scenes/player.svelte';
  import { sceneStore } from '../lib/scenes/store.svelte';
  import SceneDialog from './SceneDialog.svelte';
  import ScenePad from './ScenePad.svelte';

  // null: closed; 'new': recording; Scene: editing that scene.
  let dialog = $state<null | 'new' | Scene>(null);

  const scenes = $derived(sceneStore.inUniverse(mixer.universe));
  const elsewhere = $derived(sceneStore.scenes.length - scenes.length);
</script>

<div class="scenes">
  <div class="bar">
    <strong>U{mixer.universe} scenes</strong>
    <span class="muted">{scenes.length}</span>
    <span class="spacer"></span>
    {#if player.fadingId}
      <button onclick={() => player.stop()}>Stop fade</button>
    {/if}
    <button class="primary" onclick={() => (dialog = 'new')}>● Record</button>
  </div>

  <p class="hint muted">
    Tap a scene to fade to it, tap it again to switch it off. Hold <em>Bump</em> to flash it on top of the mix; let go and it
    disappears. Moving a fader by hand stops a fade.
  </p>

  <div class="grid">
    {#each scenes as s (s.id)}
      <ScenePad scene={s} onedit={() => (dialog = s)} />
    {:else}
      <p class="muted empty">
        No scenes on U{mixer.universe} yet. Set the mixer how you want it and press Record.
      </p>
    {/each}
  </div>

  {#if elsewhere > 0}
    <p class="muted">{elsewhere} more on other universes. Pick one in the header to see them.</p>
  {/if}
</div>

{#if dialog}
  <SceneDialog scene={dialog === 'new' ? undefined : dialog} onclose={() => (dialog = null)} />
{/if}

<style>
  .scenes {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .hint,
  p {
    margin: 0;
    font-size: 0.85rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 10px;
  }
  .empty {
    grid-column: 1 / -1;
    font-size: 0.95rem;
  }
</style>
