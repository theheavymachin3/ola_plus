<script lang="ts">
  import { onMount } from 'svelte';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';
  import { patch } from '../lib/patch.svelte';
  import AddFixtureDialog from './AddFixtureDialog.svelte';
  import FixtureRow from './FixtureRow.svelte';
  import ProfileLibrary from './ProfileLibrary.svelte';
  import UniverseGrid from './UniverseGrid.svelte';

  let universe = $state(1);
  let selected = $state<string | null>(null);
  let dialog = $state<null | 'add' | 'library'>(null);

  // Universes known to olad plus any a fixture already points at.
  const universeIds = $derived(
    [...new Set([...patch.universes.map((u) => u.id), ...store.universeIds(), universe])].sort((a, b) => a - b),
  );
  const list = $derived(store.inUniverse(universe));
  const used = $derived(
    list.reduce((n, f) => n + (store.lookup(f.profileId)?.modes[f.mode]?.channels.length ?? 0), 0),
  );
  const clashCount = $derived(list.filter((f) => store.conflicts.has(f.id)).length);

  onMount(() => patch.watch());
</script>

<div class="fx">
  <div class="bar">
    <div class="chips" role="tablist" aria-label="Universe">
      {#each universeIds as u (u)}
        <button role="tab" aria-selected={u === universe} class:on={u === universe} onclick={() => ((universe = u), (selected = null))}>
          U{u}{#if patch.universe(u)} <small>{patch.universe(u)?.name}</small>{/if}
        </button>
      {/each}
    </div>
    <span class="spacer"></span>
    <button onclick={() => (dialog = 'library')}>Profiles</button>
    <button class="primary" onclick={() => (dialog = 'add')}>+ Fixtures</button>
  </div>

  <p class="muted stats">
    {list.length} fixture{list.length === 1 ? '' : 's'} · {used}/512 channels used
    {#if clashCount}<span class="bad"> · {clashCount} in conflict</span>{/if}
  </p>

  <UniverseGrid {universe} {selected} onselect={(id) => (selected = id)} />

  <div class="list">
    {#each list as f (f.id)}
      <FixtureRow fixture={f} selected={selected === f.id} onselect={() => (selected = f.id)} />
    {:else}
      <p class="muted">No fixtures on U{universe}. Add some to give channels names and avoid address clashes.</p>
    {/each}
  </div>
</div>

{#if dialog === 'add'}
  <AddFixtureDialog {universe} onclose={() => (dialog = null)} onlibrary={() => (dialog = 'library')} />
{:else if dialog === 'library'}
  <ProfileLibrary onclose={() => (dialog = null)} />
{/if}

<style>
  .fx {
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
    flex-wrap: wrap;
    gap: 8px;
  }
  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .chips button.on {
    background: var(--fill);
    border-color: var(--fill);
  }
  .chips small {
    opacity: 0.8;
  }
  .spacer {
    flex: 1;
  }
  .stats {
    margin: 0;
  }
  .bad {
    color: var(--bad);
    font-weight: 700;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
