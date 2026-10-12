<script lang="ts">
  import { patch } from '../lib/patch.svelte';
  import { portLabel, portsOf, universeWarnings, type Universe } from '../lib/patchModel';
  import PortPicker from './PortPicker.svelte';
  import PriorityControl from './PriorityControl.svelte';

  let { universe }: { universe: Universe } = $props();

  let picking = $state<null | 'in' | 'out'>(null);
  let name = $state('');
  $effect(() => {
    name = universe.name;
  });

  const ins = $derived(portsOf(patch.ports, universe.id, false));
  const outs = $derived(portsOf(patch.ports, universe.id, true));
  const warnings = $derived(universeWarnings(universe, patch.ports));
</script>

<section class="card">
  <header>
    <span class="id">U{universe.id}</span>
    <input
      class="name"
      bind:value={name}
      maxlength="100"
      aria-label="Universe name"
      onchange={() => patch.rename(universe.id, name)}
    />
    <div class="seg" role="group" aria-label="Merge mode">
      {#each ['HTP', 'LTP'] as m (m)}
        <button class:on={universe.mergeMode === m} onclick={() => patch.setMergeMode(universe.id, m as 'HTP' | 'LTP')}>{m}</button>
      {/each}
    </div>
  </header>

  {#each [{ key: 'in', title: 'Inputs', list: ins }, { key: 'out', title: 'Outputs', list: outs }] as g (g.key)}
    <div class="group">
      <h4>{g.title}</h4>
      {#each g.list as p (p.id)}
        <div class="row">
          <span class="lbl" title={portLabel(p)}>{portLabel(p)}</span>
          <PriorityControl port={p} />
          <button class="x" aria-label="Unpatch {portLabel(p)}" onclick={() => patch.unpatch(p.id)}>×</button>
        </div>
      {:else}
        <div class="none">—</div>
      {/each}
      <button class="add" onclick={() => (picking = g.key as 'in' | 'out')}>+ {g.key === 'in' ? 'Input' : 'Output'}</button>
    </div>
  {/each}

  {#each warnings as w (w)}
    <p class="warn">{w}</p>
  {/each}
</section>

{#if picking}
  <PortPicker universe={universe.id} isOutput={picking === 'out'} onclose={() => (picking = null)} />
{/if}

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .id {
    font-weight: 700;
    color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px;
  }
  .name:hover,
  .name:focus {
    border-color: var(--line);
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
    padding: 6px 10px;
    min-height: 36px;
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
  h4 {
    margin: 0 0 4px;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 8px;
    background: var(--bg);
    border-radius: 8px;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    padding: 4px 12px;
    min-height: 36px;
  }
  .none {
    color: var(--dim);
    padding-left: 8px;
  }
  .add {
    align-self: flex-start;
    min-height: 36px;
    padding: 4px 12px;
  }
  .warn {
    margin: 0;
    font-size: 0.85rem;
    color: var(--accent);
  }
</style>
