<script lang="ts">
  import Fader from './Fader.svelte';
  import FixtureMixer from './FixtureMixer.svelte';
  import { mixer } from '../lib/mixer.svelte';

  let page = $state(0);
  let view = $state<'channels' | 'fixtures'>('channels');
  let width = $state(0);

  // As many faders as fit; ~64px per strip is the minimum comfortable touch width.
  const perPage = $derived(Math.max(4, Math.min(32, Math.floor(width / 64))));
  const pages = $derived(Math.ceil(512 / perPage));
  const cur = $derived(Math.min(page, pages - 1));
  const first = $derived(cur * perPage);
  const channels = $derived(
    Array.from({ length: Math.min(perPage, 512 - first) }, (_, i) => first + i),
  );
</script>

<div class="mixer" bind:clientWidth={width}>
  <div class="main">
    <div class="seg" role="tablist" aria-label="Mixer view">
      <button role="tab" aria-selected={view === 'channels'} class:on={view === 'channels'} onclick={() => (view = 'channels')}>Channels</button>
      <button role="tab" aria-selected={view === 'fixtures'} class:on={view === 'fixtures'} onclick={() => (view = 'fixtures')}>Fixtures</button>
    </div>
    {#if view === 'channels'}
      <div class="bank" style:--n={channels.length}>
        {#each channels as ch (ch)}
          <Fader label={String(ch + 1)} value={mixer.levels[ch]} onchange={(v) => mixer.setLevel(ch, v)} />
        {/each}
      </div>
    {:else}
      <FixtureMixer />
    {/if}
  </div>

  <div class="master">
    <Fader label="Master" accent max={100} value={mixer.master} onchange={(v) => mixer.setMaster(v)} />
  </div>

  <nav class="pager" hidden={view !== 'channels'}>
    <button onclick={() => (page = Math.max(0, cur - 1))} disabled={cur === 0}>◀</button>
    <span>{first + 1}–{first + channels.length}</span>
    <button onclick={() => (page = Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1}>▶</button>
  </nav>
</div>

<style>
  .mixer {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 76px;
    grid-template-rows: 1fr auto;
    gap: 12px;
    padding: 12px;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    min-width: 0;
  }
  .seg {
    display: flex;
    align-self: flex-start;
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
  .seg button.on {
    background: var(--fill);
    border-color: var(--fill);
  }
  .bank {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 8px;
    min-height: 0;
  }
  .master {
    min-height: 0;
  }
  .pager {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
  }
  .pager[hidden] {
    display: none;
  }
  .pager span {
    font-variant-numeric: tabular-nums;
    color: var(--dim);
    min-width: 7ch;
    text-align: center;
  }
</style>
