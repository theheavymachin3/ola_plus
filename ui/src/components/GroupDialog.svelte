<script lang="ts">
  import { fixtureStore } from '../lib/fixtures/store.svelte';
  import { formatRange, spanOf } from '../lib/fixtures/addressing';
  import { formatChannelList, groupChannels, parseChannelList, type Group } from '../lib/groups/model';
  import { groupStore } from '../lib/groups/store.svelte';
  import { mixer } from '../lib/mixer.svelte';
  import Dialog from './Dialog.svelte';

  // `group` set: edit it. Unset: create a new one on the universe shown in the mixer.
  let { group, onclose }: { group?: Group; onclose: () => void } = $props();

  /* svelte-ignore state_referenced_locally -- the dialog edits a draft copied once on open */
  let name = $state(group?.name ?? groupStore.nextName(mixer.universe));
  /* svelte-ignore state_referenced_locally */
  let fixtureIds = $state<string[]>(group?.fixtureIds ?? []);
  /* svelte-ignore state_referenced_locally */
  let channelText = $state(group ? formatChannelList(group.channels) : '');
  let confirmDelete = $state(false);

  const universe = $derived(group?.universe ?? mixer.universe);
  const fixtures = $derived(fixtureStore.inUniverse(universe));
  const parsed = $derived(parseChannelList(channelText));
  const draft = $derived<Group>({
    id: group?.id ?? '',
    name,
    universe,
    fixtureIds,
    channels: 'channels' in parsed ? parsed.channels : [],
  });
  const total = $derived(groupChannels(draft, fixtureStore.fixtures, fixtureStore.lookup).length);

  function toggle(id: string, on: boolean) {
    fixtureIds = on ? [...fixtureIds, id] : fixtureIds.filter((x) => x !== id);
  }

  function save(e: Event) {
    e.preventDefault();
    if ('error' in parsed) return;
    const next = { name: name.trim() || groupStore.nextName(universe), fixtureIds, channels: parsed.channels };
    if (group) groupStore.update(group.id, next);
    else groupStore.add({ ...next, universe });
    onclose();
  }

  function remove() {
    if (!group) return;
    groupStore.remove(group.id);
    onclose();
  }
</script>

<Dialog title={group ? 'Edit group' : 'New group'} {onclose}>
  <form onsubmit={save}>
    <label>
      Name
      <input type="text" bind:value={name} maxlength="40" />
    </label>

    <fieldset>
      <legend>Fixtures on U{universe}</legend>
      {#each fixtures as f (f.id)}
        <label class="check">
          <input type="checkbox" checked={fixtureIds.includes(f.id)} onchange={(e) => toggle(f.id, e.currentTarget.checked)} />
          <span>{f.name} <small class="muted">ch {formatRange(spanOf(f, fixtureStore.lookup))}</small></span>
        </label>
      {:else}
        <p class="muted">No fixtures patched on U{universe}. Add some in the Fixtures tab, or use channels below.</p>
      {/each}
    </fieldset>

    <label>
      Extra channels
      <input type="text" bind:value={channelText} placeholder="e.g. 1-16, 20, 33-36" aria-invalid={'error' in parsed} />
      {#if 'error' in parsed}<span class="err" role="alert">{parsed.error}</span>{/if}
    </label>

    <p class="muted">The group fader scales these {total} channel{total === 1 ? '' : 's'} from 0 to 100%.</p>

    <div class="actions">
      {#if group}
        {#if confirmDelete}
          <button type="button" class="danger" onclick={remove}>Really delete</button>
        {:else}
          <button type="button" onclick={() => (confirmDelete = true)}>Delete</button>
        {/if}
      {/if}
      <span class="spacer"></span>
      <button type="button" onclick={onclose}>Cancel</button>
      <button type="submit" class="primary" disabled={'error' in parsed}>{group ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  label :global(input[type='text']) {
    color: var(--text);
    font-size: 1rem;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 30dvh;
    overflow: auto;
  }
  legend {
    font-size: 0.8rem;
    color: var(--dim);
    padding: 0 6px;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    color: var(--text);
    font-size: 0.95rem;
    min-height: 36px;
  }
  .check input {
    min-width: 18px;
    min-height: 18px;
  }
  p {
    margin: 0;
  }
  .err {
    color: var(--bad);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .danger {
    background: var(--bad);
    border-color: var(--bad);
  }
</style>
