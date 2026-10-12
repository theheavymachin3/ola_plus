<script lang="ts">
  import { onMount } from 'svelte';
  import { fixtureStore } from '../lib/fixtures/store.svelte';
  import { formatValue, ownerOf, type ValueMode } from '../lib/monitor/cells';
  import { monitor } from '../lib/monitor/monitor.svelte';
  import { mixer } from '../lib/mixer.svelte';
  import { activity } from '../lib/overview/summary';
  import MonitorGrid from './MonitorGrid.svelte';

  let mode = $state<ValueMode>('dec');
  let selected = $state<number | null>(null);

  const stats = $derived(activity(monitor.values));
  const owner = $derived(
    selected === null ? null : ownerOf(selected, mixer.universe, fixtureStore.fixtures, fixtureStore.lookup),
  );
  const value = $derived(selected === null ? 0 : (monitor.values[selected] ?? 0));

  // Follow whichever universe the header has selected, only while this tab is open.
  onMount(() => {
    monitor.start(() => mixer.universe);
    return () => monitor.stop();
  });
  $effect(() => {
    void mixer.universe;
    selected = null;
  });
</script>

<div class="monitor">
  <div class="bar">
    <strong>U{mixer.universe}</strong>
    <span class="muted">{stats.active} active · peak {formatValue(stats.peak, mode)}</span>
    <span class="spacer"></span>
    <div class="seg" role="group" aria-label="Show values as">
      {#each [['dec', '0–255'], ['pct', '%'], ['hex', 'Hex']] as [m, label] (m)}
        <button class:on={mode === m} onclick={() => (mode = m as ValueMode)}>{label}</button>
      {/each}
    </div>
    <button class:on={monitor.paused} onclick={() => (monitor.paused = !monitor.paused)}>
      {monitor.paused ? '▶ Resume' : '⏸ Pause'}
    </button>
  </div>

  {#if monitor.problem}
    <p class="problem" role="status">
      Can't read universe {mixer.universe}: {monitor.problem.replace(/<[^>]*>/g, ' ')}
    </p>
  {/if}

  <div class="info" aria-live="polite">
    {#if selected === null}
      <span class="muted">Tap a channel (or use the arrow keys) for details. Coloured edges mark fixtures.</span>
    {:else}
      <strong>Channel {selected + 1}</strong>
      <span>= {value} ({formatValue(value, 'pct')}%, 0x{formatValue(value, 'hex')})</span>
      {#if owner}
        <span class="muted">{owner.fixture.name} · {owner.channelName}</span>
      {:else}
        <span class="muted">no fixture</span>
      {/if}
    {/if}
  </div>

  <div class="scroll">
    <MonitorGrid
      universe={mixer.universe}
      values={monitor.values}
      flash={monitor.flash}
      {mode}
      {selected}
      onselect={(ch) => (selected = ch)}
    />
  </div>
</div>

<style>
  .monitor {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
    min-height: 36px;
    padding: 4px 12px;
  }
  .seg button:first-child {
    border-radius: 8px 0 0 8px;
  }
  .seg button:last-child {
    border-radius: 0 8px 8px 0;
  }
  button.on {
    background: var(--fill);
    border-color: var(--fill);
  }
  .bar > button {
    min-height: 36px;
    padding: 4px 12px;
  }
  .info {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
    min-height: 1.6em;
    font-size: 0.9rem;
  }
  .problem {
    margin: 0;
    color: var(--accent);
    font-size: 0.85rem;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
