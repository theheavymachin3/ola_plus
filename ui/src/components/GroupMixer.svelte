<script lang="ts">
  import { groupChannels, type Group } from '../lib/groups/model';
  import { fixtureStore } from '../lib/fixtures/store.svelte';
  import { groupStore } from '../lib/groups/store.svelte';
  import { mixer } from '../lib/mixer.svelte';
  import Fader from './Fader.svelte';
  import GroupDialog from './GroupDialog.svelte';

  // null: closed; 'new': creating; Group: editing that group.
  let dialog = $state<null | 'new' | Group>(null);

  const groups = $derived(groupStore.inUniverse(mixer.universe));
  const size = (g: Group) => groupChannels(g, fixtureStore.fixtures, fixtureStore.lookup).length;
</script>

<div class="gm">
  {#each groups as g (g.id)}
    <div class="strip">
      <Fader label={g.name} value={groupStore.level(g.id)} max={100} onchange={(v) => groupStore.setLevel(g.id, v)} />
      <button class="edit" onclick={() => (dialog = g)} aria-label="Edit {g.name}" title="{size(g)} channels">✎</button>
    </div>
  {/each}
  <div class="add">
    <button onclick={() => (dialog = 'new')}>+ Group</button>
    {#if groups.length === 0}
      <p class="muted">
        A group is a master fader for some fixtures or channels, e.g. “Front wash” or “Back”.
      </p>
    {/if}
  </div>
</div>

{#if dialog}
  <GroupDialog group={dialog === 'new' ? undefined : dialog} onclose={() => (dialog = null)} />
{/if}

<style>
  .gm {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .strip {
    flex: none;
    width: 76px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }
  .strip :global(.fader) {
    flex: 1;
    height: auto;
    min-height: 0;
  }
  .strip :global(.lbl) {
    max-width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .edit {
    min-height: 36px;
    padding: 4px;
  }
  .add {
    flex: none;
    width: min(220px, 60vw);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
  }
</style>
