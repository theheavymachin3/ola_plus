<script lang="ts">
  import { formatRange, spanOf } from '../lib/fixtures/addressing';
  import { channelTint } from '../lib/fixtures/ofl';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';
  import { mixer } from '../lib/mixer.svelte';
  import Fader from './Fader.svelte';

  const list = $derived(store.inUniverse(mixer.universe));
</script>

<div class="fm">
  {#each list as f (f.id)}
    {@const profile = store.lookup(f.profileId)}
    {@const channels = profile?.modes[f.mode]?.channels ?? []}
    <section class="group" class:clash={store.conflicts.has(f.id)}>
      <header>
        <strong>{f.name}</strong>
        <small>{formatRange(spanOf(f, store.lookup))}</small>
      </header>
      <div class="faders">
        {#each channels as c, i (i)}
          {@const slot = f.address - 1 + i}
          {#if slot < 512 && c.type !== 'NoFunction'}
            <Fader label={c.name} tint={channelTint(c)} value={mixer.levels[slot]} onchange={(v) => mixer.setLevel(slot, v)} />
          {/if}
        {/each}
      </div>
    </section>
  {:else}
    <p class="muted">No fixtures patched on U{mixer.universe}. Add some in the Fixtures tab.</p>
  {/each}
</div>

<style>
  .fm {
    display: flex;
    gap: 10px;
    height: 100%;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .group {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 12px;
    min-height: 0;
  }
  .group.clash {
    border-color: var(--bad);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.85rem;
  }
  small {
    color: var(--dim);
  }
  .faders {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 6px;
  }
  .faders :global(.fader) {
    width: 52px;
  }
  .faders :global(.lbl) {
    font-size: 0.65rem;
    max-width: 52px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
