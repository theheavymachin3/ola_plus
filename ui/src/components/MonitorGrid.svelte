<script lang="ts">
  import { fixtureStore } from '../lib/fixtures/store.svelte';
  import { spanOf } from '../lib/fixtures/addressing';
  import { columnsFor, formatValue, heat, type ValueMode } from '../lib/monitor/cells';

  interface Props {
    universe: number;
    values: number[];
    flash: ReadonlySet<number>;
    mode: ValueMode;
    selected: number | null;
    onselect: (ch: number) => void;
  }
  let { universe, values, flash, mode, selected, onselect }: Props = $props();

  let width = $state(0);
  const cols = $derived(columnsFor(width));
  const rows = $derived(512 / cols);

  // channel (0-based) -> fixture, for a coloured edge and a tooltip.
  const owners = $derived.by(() => {
    const map = new Map<number, { name: string; hue: number }>();
    for (const f of fixtureStore.inUniverse(universe)) {
      const { first, last } = spanOf(f, fixtureStore.lookup);
      let h = 0;
      for (const c of f.id) h = (h * 31 + c.charCodeAt(0)) % 360;
      for (let a = Math.max(1, first); a <= Math.min(512, last); a++) map.set(a - 1, { name: f.name, hue: h });
    }
    return map;
  });

  function key(e: KeyboardEvent) {
    const cur = selected ?? 0;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (!(e.key in step)) return;
    e.preventDefault();
    onselect(Math.max(0, Math.min(511, cur + step[e.key])));
  }
</script>

<div
  class="grid"
  bind:clientWidth={width}
  style:--cols={cols}
  role="grid"
  tabindex="0"
  aria-label="DMX channels of universe {universe}"
  onkeydown={key}
>
  {#each { length: rows } as _, r (r)}
    <span class="gutter" role="rowheader">{r * cols + 1}</span>
    {#each { length: cols } as __, c (c)}
      {@const ch = r * cols + c}
      {@const v = values[ch] ?? 0}
      {@const o = owners.get(ch)}
      <div
        class="cell"
        class:lit={v > 0}
        class:hot={heat(v) > 0.6}
        class:flash={flash.has(ch)}
        class:sel={selected === ch}
        role="gridcell"
        tabindex="-1"
        aria-selected={selected === ch}
        style:--heat={heat(v)}
        style:--fx={o ? `hsl(${o.hue} 60% 50%)` : 'transparent'}
        title="{ch + 1}{o ? ` · ${o.name}` : ''} = {v}"
        onclick={() => onselect(ch)}
        onkeydown={(e) => e.key === 'Enter' && onselect(ch)}
      >
        <small>{ch + 1}</small>
        <b>{formatValue(v, mode)}</b>
      </div>
    {/each}
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 2.4em repeat(var(--cols), minmax(0, 1fr));
    gap: 2px;
    outline: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .grid:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .gutter {
    font-size: 0.65rem;
    color: var(--dim);
    align-self: center;
    text-align: right;
    padding-right: 4px;
    font-variant-numeric: tabular-nums;
  }
  .cell {
    position: relative;
    aspect-ratio: 1.15;
    min-height: 34px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border-bottom: 3px solid var(--fx);
    background: color-mix(in srgb, var(--accent) calc(var(--heat) * 100%), var(--panel));
    color: var(--dim);
    cursor: pointer;
    overflow: hidden;
  }
  .cell small {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 0.55rem;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
  }
  .cell b {
    font-size: 0.85rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .cell.lit {
    color: var(--text);
  }
  .cell.hot {
    color: #000;
  }
  .cell.flash {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .cell.sel {
    box-shadow: 0 0 0 2px var(--fill);
    z-index: 1;
  }
  @media (max-width: 520px) {
    .cell b {
      font-size: 0.75rem;
    }
  }
</style>
