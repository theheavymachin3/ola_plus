<script lang="ts">
  import { findConflicts, formatRange, sequentialAddresses } from '../lib/fixtures/addressing';
  import { DMX_SLOTS, footprintOf, profileLabel, type FixtureInst } from '../lib/fixtures/model';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';
  import { patch } from '../lib/patch.svelte';
  import Dialog from './Dialog.svelte';

  let { universe, onclose, onlibrary }: {
    universe: number;
    onclose: () => void;
    onlibrary: () => void;
  } = $props();

  let profileId = $state(store.profiles[store.profiles.length - 1].id);
  let mode = $state(0);
  let count = $state(1);
  // svelte-ignore state_referenced_locally -- initial value only; the user edits it afterwards
  let uni = $state(universe);
  let start = $state(1);
  let gap = $state(0);
  let name = $state('');
  let startEdited = $state(false);

  const profile = $derived(store.lookup(profileId));
  const footprint = $derived(footprintOf(profile, mode));
  const universeIds = $derived(
    [...new Set([...patch.universes.map((u) => u.id), ...store.universeIds(), uni])].sort((a, b) => a - b),
  );

  // Until the user types an address, keep suggesting the first free slot.
  $effect(() => {
    if (!startEdited && footprint) start = store.suggestAddress(uni, footprint);
  });
  $effect(() => {
    if (!profile?.modes[mode]) mode = 0;
  });

  const addresses = $derived(sequentialAddresses(start, footprint, count, gap));
  const dropped = $derived(Math.max(0, count - addresses.length));
  const clashes = $derived.by(() => {
    const draft: FixtureInst[] = addresses.map((address, i) => ({
      id: `draft-${i}`, name: '', profileId, mode, universe: uni, address,
    }));
    const bad = findConflicts([...store.fixtures, ...draft], store.lookup);
    return draft.filter((d) => bad.has(d.id)).length;
  });
  const lastSpan = $derived(
    addresses.length ? { first: addresses[0], last: addresses[addresses.length - 1] + footprint - 1 } : null,
  );

  function submit(e: Event) {
    e.preventDefault();
    if (!addresses.length) return;
    store.add({ profileId, mode, count: addresses.length, universe: uni, start, gap, name });
    onclose();
  }
</script>

<Dialog title="Add fixtures" {onclose}>
  <form onsubmit={submit}>
    <label>
      Profile
      <select bind:value={profileId} onchange={() => (mode = 0)}>
        {#each store.profiles as p (p.id)}
          <option value={p.id}>{profileLabel(p)}</option>
        {/each}
      </select>
    </label>
    <button type="button" class="link" onclick={onlibrary}>Import more profiles…</button>

    {#if profile}
      <label>
        Mode
        <select bind:value={mode}>
          {#each profile.modes as m, i (i)}
            <option value={i}>{m.name} · {m.channels.length} ch</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="grid">
      <label>Quantity <input type="number" min="1" max="256" bind:value={count} /></label>
      <label>
        Universe
        <select bind:value={uni} onchange={() => (startEdited = false)}>
          {#each universeIds as u (u)}<option value={u}>U{u}</option>{/each}
        </select>
      </label>
      <label>
        Start address
        <input type="number" min="1" max={DMX_SLOTS} bind:value={start} oninput={() => (startEdited = true)} />
      </label>
      <label>Gap between <input type="number" min="0" max="64" bind:value={gap} /></label>
    </div>

    <label>Name <input type="text" bind:value={name} placeholder={profile?.name ?? 'Fixture'} /></label>

    <p class="summary">
      {#if lastSpan}
        {addresses.length} × {footprint} ch → U{uni} · {formatRange(lastSpan)}
      {:else}
        Nothing fits at this address.
      {/if}
    </p>
    {#if dropped > 0 && addresses.length}<p class="warn">Only {addresses.length} of {count} fit before slot {DMX_SLOTS}.</p>{/if}
    {#if clashes}<p class="warn">{clashes} would overlap existing fixtures.</p>{/if}

    <button class="primary" type="submit" disabled={!addresses.length}>Add {addresses.length || ''} fixture{addresses.length === 1 ? '' : 's'}</button>
  </form>
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  label :global(input),
  label :global(select) {
    color: var(--text);
    font-size: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .summary {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .warn {
    margin: 0;
    color: var(--accent);
  }
  .link {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--fill);
    padding: 0;
    min-height: 0;
  }
</style>
