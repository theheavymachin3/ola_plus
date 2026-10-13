<script lang="ts">
  import { displayName, MAX_ADDRESS, planSequential, type RdmDevice } from '../lib/rdm/model';
  import { rdmStore } from '../lib/rdm/rdm.svelte';
  import Dialog from './Dialog.svelte';

  let { devices, onclose }: { devices: RdmDevice[]; onclose: () => void } = $props();

  let start = $state(1);
  let gap = $state(0);
  let working = $state(false);
  let result = $state('');

  const startOk = $derived(Number.isInteger(start) && start >= 1 && start <= MAX_ADDRESS);
  const gapOk = $derived(Number.isInteger(gap) && gap >= 0 && gap <= MAX_ADDRESS);
  const plan = $derived(startOk && gapOk ? planSequential(devices, start, gap) : null);
  const name = (uid: string) => {
    const d = devices.find((x) => x.uid === uid);
    return d ? displayName(d) : uid;
  };

  async function apply() {
    if (!plan || plan.changes.length === 0 || working) return;
    working = true;
    const r = await rdmStore.applyChanges(plan.changes);
    working = false;
    if (r.failed === 0) onclose();
    else result = `${r.done} changed, ${r.failed} failed. The failed ones show their error on their card.`;
  }
</script>

<Dialog title="Address in a row" {onclose}>
  <p class="muted">
    Gives every device its own channels, one after the other in their current order. Nothing is sent until you press
    Apply.
  </p>
  <div class="row">
    <label>
      First address
      <input type="number" min="1" max="512" bind:value={start} />
    </label>
    <label>
      Free channels between devices
      <input type="number" min="0" max="512" bind:value={gap} />
    </label>
  </div>

  {#if !plan}
    <p class="err">Use whole numbers: first address 1 to 512, gap 0 or more.</p>
  {:else}
    {#if plan.changes.length === 0}
      <p class="muted">Nothing to change: the devices are already laid out like this.</p>
    {:else}
      <ul>
        {#each plan.changes as c (c.uid)}
          <li><span class="n">{name(c.uid)}</span><span class="a">{c.from ?? '?'} → {c.to}</span></li>
        {/each}
      </ul>
    {/if}
    {#if plan.overflow.length}
      <p class="err">
        Would not fit below {MAX_ADDRESS}, left as they are: {plan.overflow.map(name).join(', ')}.
      </p>
    {/if}
  {/if}
  {#if result}<p class="err" role="alert">{result}</p>{/if}

  <div class="actions">
    <span class="spacer"></span>
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!plan || plan.changes.length === 0 || working} onclick={apply}>
      {working ? 'Applying…' : `Apply${plan && plan.changes.length ? ` (${plan.changes.length})` : ''}`}
    </button>
  </div>
</Dialog>

<style>
  .row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 12px 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  input {
    color: var(--text);
    font-size: 1rem;
    width: 130px;
  }
  ul {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    max-height: 34dvh;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--line);
  }
  li:last-child {
    border-bottom: none;
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .a {
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  p {
    margin: 0 0 8px;
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
