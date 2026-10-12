<script lang="ts">
  import { occupancy } from '../lib/fixtures/addressing';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';

  let { universe, selected = null, onselect }: {
    universe: number;
    selected?: string | null;
    onselect: (id: string) => void;
  } = $props();

  const occ = $derived(occupancy(store.fixtures, universe, store.lookup));
  const slots = Array.from({ length: 512 }, (_, i) => i + 1);

  // Stable colour per fixture so neighbours are distinguishable.
  function hue(id: string): number {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  function title(slot: number): string {
    const ids = occ.get(slot) ?? [];
    if (!ids.length) return `${slot}: free`;
    return `${slot}: ${ids.map((i) => store.fixtures.find((f) => f.id === i)?.name).join(' + ')}`;
  }
</script>

<div class="grid" role="group" aria-label="Universe {universe} address map">
  {#each slots as s (s)}
    {@const ids = occ.get(s) ?? []}
    {#if ids.length}
      <button
        class="cell"
        class:clash={ids.length > 1}
        class:sel={ids.includes(selected ?? '')}
        style:--h={hue(ids[0])}
        title={title(s)}
        aria-label={title(s)}
        onclick={() => onselect(ids[0])}
      ></button>
    {:else}
      <span class="cell free" title={title(s)}></span>
    {/if}
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(32, minmax(0, 1fr));
    gap: 2px;
  }
  .cell {
    aspect-ratio: 1;
    min-height: 0;
    padding: 0;
    border-radius: 3px;
    border: none;
    background: hsl(var(--h) 55% 45%);
  }
  .cell.free {
    background: var(--panel);
  }
  .cell.clash {
    background: repeating-linear-gradient(45deg, var(--bad), var(--bad) 3px, #000 3px, #000 5px);
  }
  .cell.sel {
    outline: 2px solid var(--text);
    outline-offset: 0;
  }
</style>
