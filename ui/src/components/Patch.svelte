<script lang="ts">
  import { onMount } from 'svelte';
  import { patch } from '../lib/patch.svelte';
  import DevicePorts from './DevicePorts.svelte';
  import UniverseCard from './UniverseCard.svelte';

  let view = $state<'universes' | 'devices'>('universes');

  onMount(() => patch.watch());
</script>

<div class="patch">
  <div class="bar">
    <div class="seg" role="tablist">
      <button class:on={view === 'universes'} onclick={() => (view = 'universes')}>By universe</button>
      <button class:on={view === 'devices'} onclick={() => (view = 'devices')}>By device</button>
    </div>
    <span class="spacer"></span>
    <button onclick={() => patch.newUniverse('')}>+ Universe</button>
  </div>

  {#if patch.error}<p class="err" role="alert">{patch.error}</p>{/if}

  {#if !patch.loaded && !patch.error}
    <p class="dim">Loading…</p>
  {:else if view === 'universes'}
    <div class="grid">
      {#each patch.universes as u (u.id)}
        <UniverseCard universe={u} />
      {:else}
        <p class="dim">No universes yet. Create one, or patch a port from the “By device” tab.</p>
      {/each}
    </div>
  {:else}
    <DevicePorts />
  {/if}
</div>

<style>
  .patch {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
  }
  .bar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .spacer {
    flex: 1;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 8px 0 0 8px;
  }
  .seg button:last-child {
    border-radius: 0 8px 8px 0;
  }
  .seg button.on {
    background: var(--fill);
    border-color: var(--fill);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
    gap: 12px;
    align-items: start;
  }
  .err {
    color: var(--bad);
  }
  .dim {
    color: var(--dim);
  }
</style>
