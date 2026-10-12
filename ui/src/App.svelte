<script lang="ts">
  import { onMount } from 'svelte';
  import Mixer from './components/Mixer.svelte';
  import Fixtures from './components/Fixtures.svelte';
  import Patch from './components/Patch.svelte';
  import Plugins from './components/Plugins.svelte';
  import Scenes from './components/Scenes.svelte';
  import { mixer } from './lib/mixer.svelte';

  type Tab = 'mixer' | 'scenes' | 'patch' | 'fixtures' | 'plugins';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'mixer', label: 'Mixer' },
    { id: 'scenes', label: 'Scenes' },
    { id: 'patch', label: 'Patch' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'plugins', label: 'Plugins' },
  ];

  const fromHash = location.hash.slice(1) as Tab;
  let tab = $state<Tab>(TABS.some((t) => t.id === fromHash) ? fromHash : 'mixer');
  $effect(() => {
    location.hash = tab;
  });

  onMount(() => {
    mixer.start();
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
  {#if tab === 'mixer' || tab === 'scenes'}
    <select value={mixer.universe} onchange={(e) => mixer.selectUniverse(Number(e.currentTarget.value))}>
      {#each mixer.universes as u (u.id)}
        <option value={u.id}>U{u.id}{u.name ? ` · ${u.name}` : ''}</option>
      {/each}
      {#if !mixer.universes.length}<option value={mixer.universe}>U{mixer.universe}</option>{/if}
    </select>
    {#if tab === 'mixer'}<button onclick={() => mixer.clearAll()}>Clear</button>{/if}
    <button class:alert={mixer.blackout} onclick={() => mixer.toggleBlackout()}>Blackout</button>
  {/if}
  <span class="dot" class:ok={mixer.online} title={mixer.online ? 'Connected' : 'olad unreachable'}></span>
</header>

{#if tab === 'mixer'}
  <Mixer />
{:else if tab === 'scenes'}
  <Scenes />
{:else if tab === 'patch'}
  <Patch />
{:else if tab === 'fixtures'}
  <Fixtures />
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
