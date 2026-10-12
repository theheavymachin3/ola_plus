<script lang="ts">
  import { patch } from '../lib/patch.svelte';
  import { portLabel } from '../lib/patchModel';

  interface Props {
    universe: number;
    isOutput: boolean;
    onclose: () => void;
  }
  let { universe, isOutput, onclose }: Props = $props();

  let q = $state('');

  // Ports of the right direction that aren't already on this universe. Ports patched
  // elsewhere are offered too (picking one moves it), shown with where they are now.
  const candidates = $derived(
    patch.ports
      .filter((p) => p.isOutput === isOutput && p.universe !== universe)
      .filter((p) => portLabel(p).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(a.universe !== null) - Number(b.universe !== null)),
  );

  async function pick(id: string) {
    await patch.patch(id, universe);
    onclose();
  }
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dialog" role="dialog" aria-label="Add port">
  <h3>Add {isOutput ? 'output' : 'input'} to universe {universe}</h3>
  <!-- svelte-ignore a11y_autofocus -->
  <input type="search" placeholder="Filter devices…" bind:value={q} autofocus />
  <ul>
    {#each candidates as p (p.id)}
      <li>
        <button onclick={() => pick(p.id)}>
          <span>{portLabel(p)}</span>
          <small>{p.universe === null ? 'free' : `moves from U${p.universe}`}</small>
        </button>
      </li>
    {:else}
      <li class="empty">No {isOutput ? 'output' : 'input'} ports available.</li>
    {/each}
  </ul>
  <button class="close" onclick={onclose}>Cancel</button>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: #000a;
    z-index: 10;
  }
  .dialog {
    position: fixed;
    z-index: 11;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 24px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px;
  }
  h3 {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }
  small {
    color: var(--dim);
    white-space: nowrap;
  }
  .empty {
    color: var(--dim);
    padding: 8px;
  }
</style>
