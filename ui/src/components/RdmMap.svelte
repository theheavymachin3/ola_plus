<script lang="ts">
  import { displayName, spanOf, type RdmDevice } from '../lib/rdm/model';

  let { devices, colors, conflicts }: {
    devices: RdmDevice[];
    colors: Record<string, string>;
    conflicts: Set<string>;
  } = $props();

  const blocks = $derived(
    devices
      .map((d) => ({ d, span: spanOf(d) }))
      .filter((b): b is { d: RdmDevice; span: NonNullable<ReturnType<typeof spanOf>> } => b.span !== null),
  );
  const TICKS = [1, 128, 256, 384, 512];
  const pct = (ch: number) => `${((ch - 1) / 512) * 100}%`;
</script>

<div class="map" role="img" aria-label="DMX channels used by each device, 1 to 512">
  <div class="bar">
    {#each blocks as b (b.d.uid)}
      <div
        class="block"
        class:conflict={conflicts.has(b.d.uid)}
        style:left={pct(b.span.start)}
        style:width="{((b.span.end - b.span.start + 1) / 512) * 100}%"
        style:--tag={colors[b.d.uid]}
        title="{displayName(b.d)}: {b.span.start}–{b.span.end}"
      ></div>
    {/each}
  </div>
  <div class="ticks" aria-hidden="true">
    {#each TICKS as t (t)}<span style:left={pct(t)}>{t}</span>{/each}
  </div>
</div>

<style>
  .map {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 8px;
  }
  .bar {
    position: relative;
    height: 28px;
    background: var(--cap);
    border-radius: 6px;
    overflow: hidden;
  }
  .block {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 2px;
    background: var(--tag);
    box-shadow: inset 0 0 0 1px #0007;
    opacity: 0.9;
  }
  .block.conflict {
    background: repeating-linear-gradient(45deg, var(--bad) 0 4px, #0000 4px 8px), var(--tag);
  }
  .ticks {
    position: relative;
    height: 1em;
    font-size: 0.7rem;
    color: var(--dim);
  }
  .ticks span {
    position: absolute;
    transform: translateX(-50%);
  }
  .ticks span:first-child {
    transform: none;
  }
  .ticks span:last-child {
    transform: translateX(-100%);
  }
</style>
