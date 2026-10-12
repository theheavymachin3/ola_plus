<script lang="ts">
  import { onMount } from 'svelte';
  import { newId } from '../lib/id';
  import { parseOfl } from '../lib/fixtures/ofl';
  import { fetchProfile, listFixtures, listManufacturers, type Manufacturer } from '../lib/fixtures/oflRemote';
  import { profileLabel } from '../lib/fixtures/model';
  import { fixtureStore as store } from '../lib/fixtures/store.svelte';
  import Dialog from './Dialog.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let tab = $state<'ofl' | 'paste' | 'installed'>('ofl');
  let status = $state('');
  let failed = $state(false);

  function report(msg: string, bad = false) {
    status = msg;
    failed = bad;
  }

  // --- Open Fixture Library browser ---
  let mans = $state<Manufacturer[]>([]);
  let manFilter = $state('');
  let manKey = $state('');
  let fixtures = $state<string[]>([]);
  let fixFilter = $state('');
  let loading = $state(false);

  const shownMans = $derived(mans.filter((m) => m.name.toLowerCase().includes(manFilter.toLowerCase())));
  const shownFix = $derived(fixtures.filter((f) => f.includes(fixFilter.toLowerCase().replace(/\s+/g, '-'))));
  const man = $derived(mans.find((m) => m.key === manKey));

  onMount(async () => {
    try {
      mans = await listManufacturers();
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    }
  });

  async function pickManufacturer(key: string) {
    manKey = key;
    fixtures = [];
    fixFilter = '';
    if (!key) return;
    loading = true;
    try {
      fixtures = await listFixtures(key);
      report('');
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    }
    loading = false;
  }

  async function importFixture(key: string) {
    if (!man) return;
    try {
      const { profile, skippedModes } = await fetchProfile(man, key);
      store.addProfile(profile);
      report(
        `Imported ${profileLabel(profile)} (${profile.modes.length} modes)` +
          (skippedModes.length ? `. Skipped matrix modes: ${skippedModes.join(', ')}.` : '.'),
      );
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    }
  }

  // --- paste / file ---
  let pasted = $state('');
  let pastedMan = $state('');

  function importPasted() {
    try {
      const { profile, skippedModes } = parseOfl(JSON.parse(pasted), pastedMan.trim(), `custom:${pastedMan.trim()}/${newId().slice(0, 8)}`);
      store.addProfile({ ...profile, source: 'custom' });
      pasted = '';
      report(`Imported ${profileLabel(profile)}.` + (skippedModes.length ? ` Skipped matrix modes: ${skippedModes.join(', ')}.` : ''));
    } catch (e) {
      report(e instanceof SyntaxError ? 'That is not valid JSON.' : e instanceof Error ? e.message : String(e), true);
    }
  }

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) pasted = await f.text();
  }

  function remove(id: string) {
    if (!store.removeProfile(id)) report('That profile is used by patched fixtures. Remove them first.', true);
  }
</script>

<Dialog title="Fixture profiles" {onclose} wide>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'ofl'} class:on={tab === 'ofl'} onclick={() => (tab = 'ofl')}>Open Fixture Library</button>
    <button role="tab" aria-selected={tab === 'paste'} class:on={tab === 'paste'} onclick={() => (tab = 'paste')}>Paste / file</button>
    <button role="tab" aria-selected={tab === 'installed'} class:on={tab === 'installed'} onclick={() => (tab = 'installed')}>Installed ({store.profiles.length})</button>
  </div>

  {#if status}<p class:err={failed} class="status" role="status">{status}</p>{/if}

  {#if tab === 'ofl'}
    <div class="cols">
      <div class="col">
        <input type="search" placeholder="Manufacturer…" bind:value={manFilter} />
        <ul>
          {#each shownMans as m (m.key)}
            <li><button class:on={manKey === m.key} onclick={() => pickManufacturer(m.key)}>{m.name}</button></li>
          {:else}
            <li class="muted">{mans.length ? 'No match' : 'Loading…'}</li>
          {/each}
        </ul>
      </div>
      <div class="col">
        <input type="search" placeholder="Fixture…" bind:value={fixFilter} disabled={!manKey} />
        <ul>
          {#each shownFix as f (f)}
            <li class="fx">
              <span>{f}</span>
              <button onclick={() => importFixture(f)} aria-label="Import {f}">Import</button>
            </li>
          {:else}
            <li class="muted">{loading ? 'Loading…' : manKey ? 'No fixtures' : 'Pick a manufacturer'}</li>
          {/each}
        </ul>
      </div>
    </div>
    <p class="muted small">Data from the Open Fixture Library (open-fixture-library.org). Matrix modes are not supported yet.</p>
  {:else if tab === 'paste'}
    <label class="stack">Manufacturer <input type="text" bind:value={pastedMan} placeholder="e.g. Cameo" /></label>
    <label class="stack">Fixture JSON (Open Fixture Library format) <textarea rows="9" bind:value={pasted}></textarea></label>
    <div class="actions">
      <input type="file" accept=".json,application/json" onchange={onFile} />
      <button class="primary" disabled={!pasted.trim()} onclick={importPasted}>Import</button>
    </div>
  {:else}
    <ul>
      {#each store.profiles as p (p.id)}
        <li class="fx">
          <span>{profileLabel(p)} <small class="muted">{p.modes.length} modes{store.usage(p.id) ? ` · ${store.usage(p.id)} in use` : ''}</small></span>
          {#if p.source === 'builtin'}
            <small class="muted">built-in</small>
          {:else}
            <button onclick={() => remove(p.id)} aria-label="Remove {profileLabel(p)}">Remove</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Dialog>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .tabs button.on,
  li button.on {
    background: var(--fill);
    border-color: var(--fill);
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    min-height: 0;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 42dvh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li button {
    width: 100%;
    text-align: left;
    min-height: 40px;
  }
  .fx {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 4px 4px 10px;
    background: var(--panel);
    border-radius: 8px;
    overflow-wrap: anywhere;
  }
  .fx button {
    width: auto;
    flex: none;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .status {
    margin: 0;
    color: var(--good);
  }
  .status.err {
    color: var(--bad);
  }
  .small {
    font-size: 0.8rem;
    margin: 0;
  }
  @media (max-width: 560px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
