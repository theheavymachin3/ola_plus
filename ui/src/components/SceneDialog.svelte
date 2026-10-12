<script lang="ts">
  import { mixer } from '../lib/mixer.svelte';
  import { clampFade, MAX_FADE_SECONDS, recordLevels, type Scene } from '../lib/scenes/model';
  import { sceneStore } from '../lib/scenes/store.svelte';
  import Dialog from './Dialog.svelte';

  // `scene` set: edit it. Unset: record a new one from the mixer as it is right now.
  let { scene, onclose }: { scene?: Scene; onclose: () => void } = $props();

  /* svelte-ignore state_referenced_locally -- the dialog edits a draft copied once on open */
  let name = $state(scene?.name ?? sceneStore.nextName(mixer.universe));
  /* svelte-ignore state_referenced_locally */
  let fade = $state(scene?.fade ?? 2);
  /* svelte-ignore state_referenced_locally */
  let replace = $state(scene?.replace ?? true);
  /* svelte-ignore state_referenced_locally */
  let levels = $state<[number, number][]>(scene?.levels ?? recordLevels(mixer.levels));
  let confirmDelete = $state(false);

  const universe = $derived(scene?.universe ?? mixer.universe);

  function save(e: Event) {
    e.preventDefault();
    const draft = { name: name.trim() || sceneStore.nextName(universe), fade: clampFade(fade), replace, levels };
    if (scene) sceneStore.update(scene.id, draft);
    else sceneStore.add({ ...draft, universe });
    onclose();
  }

  function remove() {
    if (!scene) return;
    sceneStore.remove(scene.id);
    onclose();
  }
</script>

<Dialog title={scene ? 'Edit scene' : 'Record scene'} {onclose}>
  <form onsubmit={save}>
    <label>
      Name
      <input type="text" bind:value={name} maxlength="40" />
    </label>

    <label>
      Fade time: <strong>{fade > 0 ? `${clampFade(fade)} s` : 'snap'}</strong>
      <input type="range" min="0" max="20" step="0.5" bind:value={fade} />
      <span class="row">
        <span class="muted">or type</span>
        <input type="number" min="0" max={MAX_FADE_SECONDS} step="0.1" bind:value={fade} class="num" />
        <span class="muted">seconds</span>
      </span>
    </label>

    <fieldset>
      <legend>When fired</legend>
      <label class="radio">
        <input type="radio" bind:group={replace} value={true} />
        <span><strong>Look</strong>: replaces everything, other channels fade to 0</span>
      </label>
      <label class="radio">
        <input type="radio" bind:group={replace} value={false} />
        <span><strong>Accent</strong>: only sets its own channels, the rest stays as it is</span>
      </label>
    </fieldset>

    <p class="muted">
      {levels.length} lit channel{levels.length === 1 ? '' : 's'} on U{universe}
      <button type="button" class="link" onclick={() => (levels = recordLevels(mixer.levels))} disabled={mixer.universe !== universe}>
        {scene ? 'Re-record from the mixer' : 'Capture again'}
      </button>
    </p>
    {#if mixer.universe !== universe}
      <p class="muted">Switch the mixer to U{universe} to re-record this scene.</p>
    {/if}

    <div class="actions">
      {#if scene}
        {#if confirmDelete}
          <button type="button" class="danger" onclick={remove}>Really delete</button>
        {:else}
          <button type="button" onclick={() => (confirmDelete = true)}>Delete</button>
        {/if}
      {/if}
      <span class="spacer"></span>
      <button type="button" onclick={onclose}>Cancel</button>
      <button type="submit" class="primary">{scene ? 'Save' : 'Record'}</button>
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
  label :global(input[type='text']),
  label strong {
    color: var(--text);
  }
  label :global(input[type='text']) {
    font-size: 1rem;
  }
  input[type='range'] {
    width: 100%;
    min-height: 32px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .num {
    width: 90px;
    color: var(--text);
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
  }
  legend {
    font-size: 0.8rem;
    color: var(--dim);
    padding: 0 6px;
  }
  .radio {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--text);
    font-size: 0.95rem;
  }
  .radio input {
    margin-top: 4px;
    min-width: 18px;
    min-height: 18px;
  }
  p {
    margin: 0;
  }
  .link {
    background: none;
    border: none;
    color: var(--fill);
    padding: 0 0 0 8px;
    min-height: 0;
  }
  .link:disabled {
    color: var(--dim);
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
