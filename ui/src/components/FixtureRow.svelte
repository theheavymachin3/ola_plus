<script lang="ts">
  import { formatRange, spanOf } from '../lib/fixtures/addressing';
  import { DMX_SLOTS, profileLabel, type FixtureInst } from '../lib/fixtures/model';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';
  import { patch } from '../lib/patch.svelte';

  let { fixture, selected = false, onselect }: {
    fixture: FixtureInst;
    selected?: boolean;
    onselect: () => void;
  } = $props();

  const profile = $derived(store.lookup(fixture.profileId));
  const span = $derived(spanOf(fixture, store.lookup));
  const clash = $derived(store.conflicts.has(fixture.id));
  const universeIds = $derived(
    [...new Set([...patch.universes.map((u) => u.id), ...store.universeIds(), fixture.universe])].sort((a, b) => a - b),
  );

  // Edit buffers: commit on change, not per keystroke.
  let name = $state('');
  let address = $state(1);
  $effect(() => {
    name = fixture.name;
    address = fixture.address;
  });

  function commitAddress() {
    const a = Math.round(address);
    if (a >= 1 && a <= DMX_SLOTS) store.update(fixture.id, { address: a });
    else address = fixture.address;
  }
</script>

<div class="row" class:selected class:clash role="row" tabindex="-1" onclick={onselect} onkeydown={(e) => e.key === 'Enter' && onselect()}>
  <input type="text" class="name" aria-label="Fixture name" bind:value={name} onchange={() => name.trim() && store.update(fixture.id, { name: name.trim() })} />

  {#if profile}
    <select
      class="mode"
      aria-label="Mode"
      value={fixture.mode}
      onchange={(e) => store.update(fixture.id, { mode: Number(e.currentTarget.value) })}
      title={profileLabel(profile)}
    >
      {#each profile.modes as m, i (i)}
        <option value={i}>{m.name} · {m.channels.length}ch</option>
      {/each}
    </select>
  {:else}
    <span class="missing">Profile missing</span>
  {/if}

  <select aria-label="Universe" value={fixture.universe} onchange={(e) => store.update(fixture.id, { universe: Number(e.currentTarget.value) })}>
    {#each universeIds as u (u)}
      <option value={u}>U{u}</option>
    {/each}
  </select>

  <label class="addr">
    <input type="number" min="1" max={DMX_SLOTS} aria-label="DMX address" bind:value={address} onchange={commitAddress} />
    <span class="muted" class:bad={clash}>{formatRange(span)}</span>
  </label>

  <button class="x" aria-label="Remove {fixture.name}" onclick={(e) => { e.stopPropagation(); store.remove(fixture.id); }}>×</button>
</div>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .row.selected {
    border-color: var(--text);
  }
  .row.clash {
    border-color: var(--bad);
  }
  .name {
    flex: 1 1 130px;
  }
  .mode {
    flex: 1 1 130px;
    min-width: 0;
  }
  .addr {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .addr input {
    width: 74px;
  }
  .addr span {
    min-width: 5ch;
    font-size: 0.85rem;
  }
  .bad {
    color: var(--bad);
    font-weight: 700;
  }
  .missing {
    color: var(--bad);
  }
  .x {
    padding: 4px 12px;
  }
</style>
