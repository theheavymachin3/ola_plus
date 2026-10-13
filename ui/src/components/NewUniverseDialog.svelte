<script lang="ts">
  import { patch } from '../lib/patch.svelte';
  import { groupByDevice, validateNewUniverse } from '../lib/patchModel';
  import Dialog from './Dialog.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // olad only keeps a universe that has at least one port, so creating one means choosing ports.
  /* svelte-ignore state_referenced_locally -- the dialog edits a draft copied once on open */
  let id = $state(patch.nextFreeId());
  let name = $state('');
  let chosen = $state<string[]>([]);
  let working = $state(false);
  let failure = $state('');

  const free = $derived(patch.ports.filter((p) => p.universe === null));
  const devices = $derived(groupByDevice(free));
  const problem = $derived(
    validateNewUniverse(Number(id), patch.universes.map((u) => u.id), chosen),
  );

  function toggle(portId: string, on: boolean) {
    chosen = on ? [...chosen, portId] : chosen.filter((p) => p !== portId);
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (problem || working) return;
    working = true;
    failure = '';
    const result = await patch.create(Number(id), name, chosen);
    working = false;
    if (result === null) onclose();
    else failure = result;
  }
</script>

<Dialog title="New universe" {onclose}>
  <form onsubmit={submit}>
    <div class="row">
      <label class="num">
        Number
        <input type="number" min="0" max="99999" bind:value={id} />
      </label>
      <label class="grow">
        Name
        <input type="text" bind:value={name} maxlength="100" placeholder="Universe {id}" />
      </label>
    </div>

    <fieldset>
      <legend>Ports that feed this universe</legend>
      {#each devices as d (d.alias)}
        <div class="device">{d.name}</div>
        {#each [...d.inputs, ...d.outputs] as p (p.id)}
          <label class="check">
            <input type="checkbox" checked={chosen.includes(p.id)} onchange={(e) => toggle(p.id, e.currentTarget.checked)} />
            <span>{p.isOutput ? 'Out' : 'In'} · {p.description || p.id}</span>
          </label>
        {/each}
      {:else}
        <p class="muted">Every port is already routed. Free one in another universe first, then create the new one.</p>
      {/each}
    </fieldset>

    {#if failure}
      <p class="err" role="alert">Could not create the universe: {failure}</p>
    {:else if problem && chosen.length === 0}
      <p class="muted">{problem}</p>
    {:else if problem}
      <p class="err" role="alert">{problem}</p>
    {/if}

    <div class="actions">
      <span class="spacer"></span>
      <button type="button" onclick={onclose}>Cancel</button>
      <button type="submit" class="primary" disabled={!!problem || working}>
        {working ? 'Creating…' : 'Create universe'}
      </button>
    </div>
  </form>
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .row {
    display: flex;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  label :global(input[type='text']),
  label :global(input[type='number']) {
    color: var(--text);
    font-size: 1rem;
  }
  .num {
    width: 96px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 34dvh;
    overflow: auto;
  }
  legend {
    font-size: 0.8rem;
    color: var(--dim);
    padding: 0 6px;
  }
  .device {
    margin-top: 6px;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--dim);
    overflow-wrap: anywhere;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    color: var(--text);
    font-size: 0.95rem;
    min-height: 36px;
  }
  .check input {
    min-width: 18px;
    min-height: 18px;
  }
  p {
    margin: 0;
  }
  .err {
    color: var(--bad);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
</style>
