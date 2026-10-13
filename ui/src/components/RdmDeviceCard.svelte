<script lang="ts">
  import { displayName, spanOf, validateAddress, type RdmDevice } from '../lib/rdm/model';
  import { rdmStore } from '../lib/rdm/rdm.svelte';

  let { device, conflict, color, disabled }: {
    device: RdmDevice;
    conflict: boolean;
    color: string;
    disabled: boolean;
  } = $props();

  // The fields edit a draft and only write to the device on Set, so typing never sends anything.
  let addressDraft = $state('');
  let labelDraft = $state('');
  $effect(() => {
    addressDraft = device.address === null ? '' : String(device.address);
  });
  $effect(() => {
    labelDraft = device.label;
  });

  const span = $derived(spanOf(device));
  const addressProblem = $derived(
    addressDraft === '' ? null : validateAddress(Number(addressDraft), device.footprint),
  );
  const addressChanged = $derived(addressDraft !== '' && Number(addressDraft) !== device.address);
  const labelChanged = $derived(labelDraft !== device.label);
  const locked = $derived(disabled || device.busy);

  function setAddress(e: Event) {
    e.preventDefault();
    if (addressProblem || !addressChanged || locked) return;
    void rdmStore.setAddress(device.uid, Number(addressDraft));
  }

  function setLabel(e: Event) {
    e.preventDefault();
    if (!labelChanged || locked) return;
    void rdmStore.setLabel(device.uid, labelDraft);
  }

  function modes() {
    if (!device.personalities) void rdmStore.loadPersonalities(device.uid);
  }
</script>

<article class="card" class:conflict style:--tag={color}>
  <header>
    <span class="tag" aria-hidden="true"></span>
    <div class="who">
      <strong title={displayName(device)}>{displayName(device)}</strong>
      <span class="uid">{device.uid}{device.manufacturer && device.label ? ` · ${device.manufacturer}` : ''}</span>
    </div>
    <button
      class="identify"
      class:on={device.identify === true}
      aria-pressed={device.identify === true}
      title="Make the fixture flash so you can find it"
      disabled={disabled}
      onclick={() => rdmStore.setIdentify(device.uid, device.identify !== true)}
    >
      Identify
    </button>
  </header>

  <form onsubmit={setAddress} class="row">
    <label>
      DMX address
      <input
        type="number"
        min="1"
        max="512"
        inputmode="numeric"
        bind:value={addressDraft}
        disabled={locked || device.footprint === 0}
        aria-invalid={addressProblem ? 'true' : 'false'}
      />
    </label>
    <button type="submit" disabled={locked || !addressChanged || !!addressProblem}>Set</button>
    <span class="muted range">
      {#if span}
        {device.footprint} ch · {span.start}–{span.end}
      {:else if device.footprint === 0}
        no DMX channels
      {:else if device.busy}
        reading…
      {/if}
    </span>
  </form>
  {#if addressProblem}<p class="err">{addressProblem}</p>{/if}
  {#if conflict}<p class="err">These channels overlap another device on this universe.</p>{/if}

  {#if device.personalityCount && device.personalityCount > 1}
    <label class="row">
      Mode
      <select
        value={device.personality}
        onfocus={modes}
        onpointerdown={modes}
        disabled={locked}
        onchange={(e) => rdmStore.setPersonality(device.uid, Number(e.currentTarget.value))}
      >
        {#if device.personalities}
          {#each device.personalities as p (p.index)}
            <option value={p.index}>{p.index}. {p.name} ({p.footprint} ch)</option>
          {/each}
        {:else}
          <option value={device.personality}>Mode {device.personality} of {device.personalityCount}</option>
        {/if}
      </select>
    </label>
  {/if}

  <form onsubmit={setLabel} class="row">
    <label class="grow">
      Label
      <input type="text" maxlength="32" bind:value={labelDraft} disabled={locked} placeholder="(none)" />
    </label>
    <button type="submit" disabled={locked || !labelChanged}>Save</button>
  </form>

  {#if device.error}<p class="err" role="alert">{device.error}</p>{/if}
</article>

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 4px solid var(--tag);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .card.conflict {
    border-color: var(--bad);
    border-left-color: var(--bad);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tag {
    display: none;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .uid {
    font-size: 0.75rem;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .identify.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #000;
  }
  .row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--dim);
  }
  label.row {
    flex-direction: row;
    align-items: center;
  }
  label.grow {
    flex: 1;
    min-width: 140px;
  }
  input[type='number'] {
    width: 96px;
  }
  input,
  select {
    color: var(--text);
    font-size: 1rem;
    min-width: 0;
  }
  .range {
    font-size: 0.8rem;
    align-self: center;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
  }
  .err {
    color: var(--bad);
  }
</style>
