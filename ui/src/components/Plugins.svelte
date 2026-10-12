<script lang="ts">
  import { onMount } from 'svelte';
  import { pluginStore as store } from '../lib/plugins.svelte';

  let open = $state<number | null>(null);
  let confirming = $state(false);

  onMount(() => {
    store.refresh();
  });

  function toggleOpen(id: number) {
    open = open === id ? null : id;
    if (open !== null && !store.info[id]) store.loadInfo(id);
  }

  async function reload() {
    confirming = false;
    await store.reload();
    if (open !== null) store.loadInfo(open);
  }
</script>

<div class="plugins">
  <div class="bar">
    <strong>{store.plugins.length} plugins</strong>
    <span class="dim">{store.plugins.filter((p) => p.active).length} active</span>
    <span class="spacer"></span>
    {#if confirming}
      <span class="dim">Devices will briefly re-initialise.</span>
      <button onclick={() => (confirming = false)}>Cancel</button>
      <button class="go" disabled={store.busy} onclick={reload}>Reload now</button>
    {:else}
      <button disabled={store.busy} onclick={() => (confirming = true)}>Reload plugins</button>
    {/if}
  </div>

  {#if store.error}<p class="err" role="alert">{store.error}</p>{/if}

  {#each store.plugins as p (p.id)}
    {@const info = store.info[p.id]}
    <section class="plugin">
      <div class="head">
        <button class="name" onclick={() => toggleOpen(p.id)} aria-expanded={open === p.id}>
          <span class="dot" class:ok={p.active} class:off={!p.enabled}></span>
          {p.name}
          <small>{p.active ? 'active' : p.enabled ? 'enabled, not running' : 'disabled'}</small>
        </button>
        <label class="switch">
          <input
            type="checkbox"
            checked={p.enabled}
            disabled={store.busy}
            onchange={(e) => store.setEnabled(p.id, e.currentTarget.checked)}
            aria-label="Enable {p.name}"
          />
          <span></span>
        </label>
      </div>
      {#if open === p.id}
        <div class="detail">
          {#if info}
            <p>{info.description}</p>
            {#if info.preferences_source}<p class="dim">Config: {info.preferences_source}</p>{/if}
            {#if info.conflicts_with.length}
              <p class="warn">
                Conflicts with: {info.conflicts_with.map((c) => `${c.name}${c.active ? ' (active)' : ''}`).join(', ')}
              </p>
            {/if}
          {:else}
            <p class="dim">Loading…</p>
          {/if}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  .plugins {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    max-width: 820px;
    width: 100%;
    margin: 0 auto;
  }
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .spacer {
    flex: 1;
  }
  .dim {
    color: var(--dim);
  }
  .err {
    color: var(--bad);
  }
  .warn {
    color: var(--accent);
  }
  .go {
    background: var(--accent);
    border-color: var(--accent);
    color: #000;
  }
  .plugin {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    margin-bottom: 8px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 12px;
  }
  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: transparent;
    border: none;
  }
  .name small {
    color: var(--dim);
    margin-left: auto;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cap);
  }
  .dot.ok {
    background: var(--good);
  }
  .dot.off {
    background: transparent;
    border: 1px solid var(--dim);
  }
  .detail {
    padding: 0 14px 10px;
    white-space: pre-wrap;
  }
  .detail p {
    margin: 6px 0;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 44px;
    height: 28px;
  }
  .switch {
    position: relative;
    width: 44px;
    height: 26px;
    flex: none;
  }
  .switch span {
    position: absolute;
    inset: 0;
    background: var(--cap);
    border-radius: 13px;
    transition: background 0.15s;
    pointer-events: none;
  }
  .switch span::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .switch input:checked + span {
    background: var(--good);
  }
  .switch input:checked + span::after {
    transform: translateX(18px);
  }
  .switch input:focus-visible + span {
    outline: 2px solid var(--accent);
  }
</style>
