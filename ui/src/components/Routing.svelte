<script lang="ts">
  import { onMount } from 'svelte';
  import { patch } from '../lib/patch.svelte';
  import DevicePorts from './DevicePorts.svelte';
  import NewUniverseDialog from './NewUniverseDialog.svelte';
  import UniverseCard from './UniverseCard.svelte';

  let view = $state<'universes' | 'devices'>('universes');
  let creating = $state(false);

  onMount(() => patch.watch());
</script>

<div class="routing">
  <div class="bar">
    <div class="seg" role="tablist">
      <button class:on={view === 'universes'} onclick={() => (view = 'universes')}>By universe</button>
      <button class:on={view === 'devices'} onclick={() => (view = 'devices')}>By device</button>
    </div>
    <span class="spacer"></span>
    <button onclick={() => (creating = true)}>+ Universe</button>
  </div>

  {#if patch.error}<p class="err" role="alert">{patch.error}</p>{/if}
  {#if patch.actionError}
    <p class="err" role="alert">
      <span>That did not work: {patch.actionError}</span>
      <button class="dismiss" onclick={() => patch.dismissActionError()} aria-label="Dismiss">×</button>
    </p>
  {/if}
  {#if patch.limited}
    <p class="note">
      This olad lists only the first free port of devices like Art-Net or sACN; the others appear as you
      patch. An OLA Plus build of olad shows them all.
    </p>
  {/if}

  {#if !patch.loaded && !patch.error}
    <p class="dim">Loading…</p>
  {:else if view === 'universes'}
    <div class="grid">
      {#each patch.universes as u (u.id)}
        <UniverseCard universe={u} />
      {:else}
        <p class="dim">No universes yet. Create one, or route a port from the “By device” view.</p>
      {/each}
    </div>
  {:else}
    <DevicePorts />
  {/if}
</div>

{#if creating}
  <NewUniverseDialog onclose={() => (creating = false)} />
{/if}

<style>
  .routing {
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
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dismiss {
    min-height: 28px;
    padding: 0 10px;
    flex: none;
  }
  .dim {
    color: var(--dim);
  }
  .note {
    margin: 0 0 12px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--accent);
    font-size: 0.85rem;
  }
</style>
