<script lang="ts">
  import { onMount } from 'svelte';
  import { fixtureStore } from '../lib/fixtures/store.svelte';
  import { groupStore } from '../lib/groups/store.svelte';
  import { mixer } from '../lib/mixer.svelte';
  import { activity, buildNotices, deviceOverviews, universeOverviews, type Goto } from '../lib/overview/summary';
  import { overviewStore as ov } from '../lib/overview/overview.svelte';
  import { patch } from '../lib/patch.svelte';
  import { portLabel } from '../lib/patchModel';
  import { pluginStore } from '../lib/plugins.svelte';
  import { sceneStore } from '../lib/scenes/store.svelte';
  import { syncSummary } from '../lib/sync/summary.svelte';
  import DmxStrip from './DmxStrip.svelte';

  let { onnavigate }: { onnavigate: (tab: Goto | 'monitor' | 'mixer') => void } = $props();

  // Keep the data this page needs fresh only while it is open.
  onMount(() => {
    const stopPatch = patch.watch();
    pluginStore.refresh();
    const t = setInterval(() => pluginStore.refresh(), 10000);
    ov.start(() => patch.universes.map((u) => u.id));
    return () => {
      stopPatch();
      clearInterval(t);
      ov.stop();
    };
  });

  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const universes = $derived(
    universeOverviews(patch.universes, patch.ports, fixtureStore.fixtures, sceneStore.scenes, groupStore.groups),
  );
  const devices = $derived(deviceOverviews(patch.ports));
  const sync = $derived(syncSummary(now));
  const notices = $derived(
    buildNotices({
      reachable: ov.reachable && !patch.error,
      universes,
      fixtureConflicts: fixtureStore.conflicts.size,
      plugins: pluginStore.plugins,
      sync: sync.state,
      patchLimited: patch.limited,
    }),
  );
  const activePlugins = $derived(pluginStore.plugins.filter((p) => p.active));
  const stagePorts = $derived(patch.ports.filter((p) => p.universe !== null).length);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function openMonitor(universe: number) {
    void mixer.selectUniverse(universe);
    onnavigate('monitor');
  }
</script>

<div class="overview">
  {#if notices.length}
    <section class="notices" aria-label="Needs attention">
      {#each notices as n (n.text)}
        <div class="notice" data-severity={n.severity}>
          <span>{n.text}</span>
          {#if n.goto}<button onclick={() => onnavigate(n.goto!)}>Open</button>{/if}
        </div>
      {/each}
    </section>
  {:else}
    <p class="allgood">Everything looks fine.</p>
  {/if}

  <section class="cards">
    <article class="card">
      <h3>Server</h3>
      {#if ov.stats}
        <dl>
          <dt>Host</dt><dd>{ov.stats.hostname}</dd>
          <dt>Address</dt><dd>{ov.stats.ip}</dd>
          <dt>Version</dt><dd>OLA {ov.stats.version}{ov.stats.build ? ` (${ov.stats.build})` : ''}</dd>
          <dt>Running since</dt><dd>{ov.stats.up_since}</dd>
        </dl>
      {:else}
        <p class="muted">{ov.reachable ? 'Loading…' : 'Not reachable'}</p>
      {/if}
    </article>

    <article class="card">
      <h3>Rig</h3>
      <dl>
        <dt>Universes</dt><dd>{patch.universes.length}</dd>
        <dt>Fixtures</dt><dd>{fixtureStore.fixtures.length}</dd>
        <dt>Scenes</dt><dd>{sceneStore.scenes.length}</dd>
        <dt>Groups</dt><dd>{groupStore.groups.length}</dd>
      </dl>
      <p class="sync" data-state={sync.state} title={sync.hint}>{sync.label}</p>
    </article>

    <article class="card">
      <h3>Devices</h3>
      <dl>
        <dt>Devices</dt><dd>{devices.length}</dd>
        <dt>Ports routed</dt><dd>{stagePorts} of {patch.ports.length}</dd>
        <dt>Plugins running</dt><dd>{activePlugins.length} of {pluginStore.plugins.length}</dd>
      </dl>
      <button onclick={() => onnavigate('plugins')}>Plugins</button>
    </article>
  </section>

  <section>
    <h2>Universes</h2>
    <div class="universes">
      {#each universes as u (u.universe.id)}
        {@const act = activity(ov.dmx[u.universe.id])}
        <article class="card universe">
          <header>
            <strong>U{u.universe.id}</strong>
            <span class="name">{u.universe.name}</span>
            <span class="badge">{u.universe.mergeMode}</span>
          </header>
          <DmxStrip values={ov.dmx[u.universe.id]} label="Activity of universe {u.universe.id}" />
          <p class="muted act">{act.active} active channel{act.active === 1 ? '' : 's'} · peak {act.peak}</p>
          <div class="ports">
            <div>
              <h4>In</h4>
              {#each u.inputs as p (p.id)}<div class="port" title={portLabel(p)}>{portLabel(p)}</div>{:else}<div class="port none">—</div>{/each}
            </div>
            <div>
              <h4>Out</h4>
              {#each u.outputs as p (p.id)}<div class="port" title={portLabel(p)}>{portLabel(p)}</div>{:else}<div class="port none">—</div>{/each}
            </div>
          </div>
          <footer>
            <span class="muted">{plural(u.fixtures, 'fixture')} · {plural(u.scenes, 'scene')} · {plural(u.groups, 'group')}</span>
            <button onclick={() => openMonitor(u.universe.id)}>Monitor</button>
          </footer>
        </article>
      {:else}
        <p class="muted">No universes yet. Route a port in the Routing tab to create one.</p>
      {/each}
    </div>
  </section>

  <section>
    <h2>Devices</h2>
    <div class="devices">
      {#each devices as d (d.alias)}
        <div class="device">
          <strong title={d.name}>{d.name}</strong>
          <span class="muted">{d.inputs.length} in · {d.outputs.length} out · {d.patched} routed</span>
          <span class="dots" aria-hidden="true">
            {#each [...d.inputs, ...d.outputs] as p (p.id)}
              <i class:on={p.universe !== null} class:out={p.isOutput}></i>
            {/each}
          </span>
        </div>
      {:else}
        <p class="muted">No devices found.</p>
      {/each}
    </div>
    <button class="link" onclick={() => onnavigate('routing')}>Open Routing</button>
  </section>
</div>

<style>
  .overview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  h3 {
    margin: 0 0 8px;
    font-size: 0.95rem;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .notices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-left-width: 4px;
    border-radius: 8px;
    background: var(--panel);
    font-size: 0.9rem;
  }
  .notice[data-severity='warn'] {
    border-left-color: var(--bad);
  }
  .notice[data-severity='info'] {
    border-left-color: var(--accent);
  }
  .notice button {
    min-height: 32px;
    padding: 2px 12px;
    flex: none;
  }
  .allgood {
    margin: 0;
    color: var(--good);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
    gap: 10px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--dim);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .sync {
    margin: 0;
    font-size: 0.8rem;
    color: var(--dim);
  }
  .sync[data-state='synced'] {
    color: var(--good);
  }
  .sync[data-state='offline'],
  .sync[data-state='conflict'] {
    color: var(--accent);
  }
  .card > button {
    align-self: flex-start;
    min-height: 32px;
    padding: 2px 12px;
  }
  .universes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 10px;
  }
  .universe header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .universe header strong {
    color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 0.7rem;
    padding: 1px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--dim);
  }
  .act {
    margin: 0;
    font-size: 0.8rem;
  }
  .ports {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    min-width: 0;
  }
  .ports > div {
    min-width: 0;
  }
  .port {
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .port.none {
    color: var(--dim);
  }
  .universe footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .universe footer .muted {
    font-size: 0.8rem;
  }
  .universe footer button {
    min-height: 32px;
    padding: 2px 12px;
  }
  .devices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: 8px;
  }
  .device {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    min-width: 0;
  }
  .device strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .device .muted {
    font-size: 0.8rem;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }
  .dots i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--cap);
  }
  .dots i.out {
    border-radius: 50%;
  }
  .dots i.on {
    background: var(--good);
  }
  .link {
    background: none;
    border: none;
    color: var(--fill);
    padding: 8px 0 0;
    min-height: 0;
  }
  p {
    margin: 0;
  }
</style>
