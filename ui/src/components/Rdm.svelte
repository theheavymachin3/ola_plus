<script lang="ts">
  import { onMount } from 'svelte';
  import { mixer } from '../lib/mixer.svelte';
  import { patch } from '../lib/patch.svelte';
  import { byAddress, overlapping } from '../lib/rdm/model';
  import { rdmStore as rdm } from '../lib/rdm/rdm.svelte';
  import AutoAddressDialog from './AutoAddressDialog.svelte';
  import RdmDeviceCard from './RdmDeviceCard.svelte';
  import RdmMap from './RdmMap.svelte';

  // The universe list comes from the same source as the Routing tab.
  onMount(() => patch.watch());

  // Pick a universe once the list is known: the mixer's current one if it exists, else the first.
  $effect(() => {
    if (!rdm.enabled || rdm.universe !== null || patch.universes.length === 0) return;
    const wanted = patch.universes.some((u) => u.id === mixer.universe) ? mixer.universe : patch.universes[0].id;
    void rdm.select(wanted);
  });

  const PALETTE = ['#3b82f6', '#e8a317', '#3fb950', '#a371f7', '#f778ba', '#39c5cf', '#d29922', '#ff7b72'];
  const ordered = $derived(byAddress(rdm.devices));
  const conflicts = $derived(overlapping(rdm.devices));
  const colors = $derived(Object.fromEntries(rdm.devices.map((d, i) => [d.uid, PALETTE[i % PALETTE.length]])));
  const lockedAll = $derived(rdm.busy);

  let autoOpen = $state(false);
</script>

<div class="rdm">
  <section class="power">
    <button
      class="switch"
      class:on={rdm.enabled}
      role="switch"
      aria-checked={rdm.enabled}
      onclick={() => rdm.setEnabled(!rdm.enabled)}
    >
      <span class="knob"></span>
      RDM {rdm.enabled ? 'on' : 'off'}
    </button>
    <span class="muted">
      {rdm.enabled
        ? 'Talking to the fixtures through the interface; this briefly takes the DMX line for each request.'
        : 'Nothing is sent to the fixtures while RDM is off.'}
    </span>
  </section>

  {#if !rdm.enabled}
    <div class="empty">
      <p>RDM is off.</p>
      <p class="muted">Turn it on to find devices and read or change their DMX addresses.</p>
    </div>
  {:else}
  <section class="bar">
    <label>
      Universe
      <select
        value={rdm.universe}
        disabled={rdm.busy}
        onchange={(e) => rdm.select(Number(e.currentTarget.value))}
      >
        {#each patch.universes as u (u.id)}
          <option value={u.id}>U{u.id}{u.name ? ` · ${u.name}` : ''}</option>
        {/each}
      </select>
    </label>
    <button class="primary" disabled={rdm.busy || rdm.universe === null} onclick={() => rdm.discover(false)}>
      Find devices
    </button>
    <button disabled={rdm.busy || rdm.universe === null} onclick={() => rdm.discover(true)} title="Only look for devices that appeared or left">
      Quick check
    </button>
    <button disabled={rdm.busy || rdm.devices.length === 0} onclick={() => rdm.refresh()}>Re-read</button>
    <span class="spacer"></span>
    <button disabled={rdm.busy || rdm.devices.length < 2} onclick={() => (autoOpen = true)}>Address in a row…</button>
  </section>

  {#if rdm.progress}<p class="muted status" aria-live="polite">{rdm.progress}</p>{/if}
  {#if rdm.error}<p class="err" role="alert">{rdm.error}</p>{/if}

  {#if patch.universes.length === 0}
    <p class="muted">No universes yet. Route an output port in the Routing tab first: RDM talks to devices through it.</p>
  {:else if rdm.devices.length === 0 && !rdm.busy}
    <div class="empty">
      <p>No RDM devices known on this universe.</p>
      <p class="muted">
        Press <strong>Find devices</strong>. Only fixtures that support RDM answer, and the universe needs an output
        port whose interface can do RDM.
      </p>
    </div>
  {:else}
    <RdmMap devices={ordered} {colors} {conflicts} />
    {#if conflicts.size}
      <p class="err">
        {conflicts.size} devices share DMX channels. Use "Address in a row…" or change their addresses below.
      </p>
    {/if}
    <div class="grid">
      {#each ordered as d (d.uid)}
        <RdmDeviceCard device={d} conflict={conflicts.has(d.uid)} color={colors[d.uid]} disabled={lockedAll} />
      {/each}
    </div>
  {/if}
  {/if}
</div>

{#if autoOpen}
  <AutoAddressDialog devices={rdm.devices} onclose={() => (autoOpen = false)} />
{/if}

<style>
  .rdm {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .power {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 999px;
  }
  .knob {
    width: 34px;
    height: 18px;
    border-radius: 999px;
    background: var(--cap);
    position: relative;
    flex: none;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    transition: transform 0.15s;
  }
  .switch.on .knob {
    background: var(--good);
  }
  .switch.on .knob::after {
    transform: translateX(16px);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--dim);
  }
  select {
    color: var(--text);
    font-size: 1rem;
  }
  .spacer {
    flex: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 10px;
  }
  .empty {
    border: 1px dashed var(--line);
    border-radius: 12px;
    padding: 20px;
  }
  p {
    margin: 0;
  }
  .status {
    font-size: 0.9rem;
  }
  .err {
    color: var(--bad);
  }
</style>
