<script lang="ts">
  import { patch } from '../lib/patch.svelte';
  import type { Port } from '../lib/patchModel';

  let { port }: { port: Port } = $props();

  // Local edit buffer so typing doesn't fire a request per keystroke; commit on change.
  let value = $state(100);
  $effect(() => {
    value = port.priority?.value ?? 100;
  });
</script>

{#if port.priority}
  <span class="prio">
    {#if port.priority.capability === 'full'}
      <select
        value={port.priority.mode}
        aria-label="Priority mode"
        onchange={(e) => patch.setPriority(port, e.currentTarget.value as 'inherit' | 'static', value)}
      >
        <option value="inherit">inherit</option>
        <option value="static">static</option>
      </select>
    {/if}
    {#if port.priority.mode === 'static' || port.priority.capability === 'static'}
      <input
        type="number"
        min="1"
        max="200"
        aria-label="Priority"
        bind:value
        onchange={() => patch.setPriority(port, 'static', Math.max(1, Math.min(200, value)))}
      />
    {/if}
  </span>
{/if}

<style>
  .prio {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .prio select,
  .prio input {
    min-height: 36px;
    padding: 4px 8px;
  }
  .prio input {
    width: 68px;
  }
</style>
