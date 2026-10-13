<script lang="ts">
  import { onMount } from 'svelte';
  import Mixer from './components/Mixer.svelte';
  import Monitor from './components/Monitor.svelte';
  import Overview from './components/Overview.svelte';
  import Patch from './components/Patch.svelte';
  import Plugins from './components/Plugins.svelte';
  import Routing from './components/Routing.svelte';
  import Scenes from './components/Scenes.svelte';
  import { fixtureStore } from './lib/fixtures/store.svelte';
  import { groupStore } from './lib/groups/store.svelte';
  import { mixer } from './lib/mixer.svelte';
  import { sceneStore } from './lib/scenes/store.svelte';
  import { syncSummary } from './lib/sync/summary.svelte';

  type Tab = 'overview' | 'mixer' | 'monitor' | 'scenes' | 'routing' | 'patch' | 'plugins';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'mixer', label: 'Mixer' },
    { id: 'monitor', label: 'Monitor' },
    { id: 'scenes', label: 'Scenes' },
    { id: 'routing', label: 'Routing' },
    { id: 'patch', label: 'Patch' },
    { id: 'plugins', label: 'Plugins' },
  ];

  const fromHash = location.hash.slice(1) as Tab;
  let tab = $state<Tab>(TABS.some((t) => t.id === fromHash) ? fromHash : 'overview');
  $effect(() => {
    location.hash = tab;
  });

  // Ticks so the "updated from another device" notice can expire.
  let now = $state(Date.now());
  const sync = $derived(syncSummary(now));

  onMount(() => {
    mixer.start();
    fixtureStore.start();
    sceneStore.start();
    groupStore.start();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

<header>
  <strong>OLA Plus</strong>
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </div>
  <span class="spacer"></span>
  {#if tab === 'mixer' || tab === 'scenes' || tab === 'monitor'}
    <select value={mixer.universe} onchange={(e) => mixer.selectUniverse(Number(e.currentTarget.value))}>
      {#each mixer.universes as u (u.id)}
        <option value={u.id}>U{u.id}{u.name ? ` · ${u.name}` : ''}</option>
      {/each}
      {#if !mixer.universes.some((u) => u.id === mixer.universe)}<option value={mixer.universe}>U{mixer.universe}</option>{/if}
    </select>
    {#if tab === 'mixer'}<button onclick={() => mixer.clearAll()}>Clear</button>{/if}
    {#if tab !== 'monitor'}<button class:alert={mixer.blackout} onclick={() => mixer.toggleBlackout()}>Blackout</button>{/if}
  {/if}
  <span class="sync" data-state={sync.state} title={sync.hint}>{sync.label}</span>
  <span class="dot" class:ok={mixer.online} title={mixer.online ? 'Connected' : 'olad unreachable'}></span>
</header>

{#if tab === 'overview'}
  <Overview onnavigate={(t) => (tab = t)} />
{:else if tab === 'mixer'}
  <Mixer />
{:else if tab === 'monitor'}
  <Monitor />
{:else if tab === 'scenes'}
  <Scenes />
{:else if tab === 'routing'}
  <Routing />
{:else if tab === 'patch'}
  <Patch />
{:else}
  <Plugins />
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
    border-bottom: 1px solid var(--line);
  }
  .tabs {
    display: flex;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto; /* safety net: never push the page wider than the screen */
    scrollbar-width: none;
  }
  .tabs button {
    white-space: nowrap;
  }
  @media (max-width: 480px) {
    header > strong {
      display: none; /* the tabs need the room */
    }
    .tabs button {
      padding: 10px 9px;
    }
  }
  .tabs button {
    background: transparent;
    border-color: transparent;
  }
  .tabs button.on {
    background: var(--panel);
    border-color: var(--line);
    color: var(--accent);
  }
  .spacer {
    flex: 1;
  }
  .sync {
    font-size: 0.75rem;
    color: var(--dim);
    white-space: nowrap;
  }
  .sync[data-state='synced'] {
    color: var(--good);
  }
  .sync[data-state='offline'],
  .sync[data-state='conflict'] {
    color: var(--accent);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bad);
  }
  .dot.ok {
    background: var(--good);
  }
</style>
