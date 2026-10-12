<script lang="ts">
  import { patch } from '../lib/patch.svelte';
  import { groupByDevice, type Port } from '../lib/patchModel';
  import PriorityControl from './PriorityControl.svelte';

  const NEW = 'new';
  const groups = $derived(groupByDevice(patch.ports));

  function assign(p: Port, v: string) {
    if (v === '') return patch.unpatch(p.id);
    if (v === NEW) return patch.patch(p.id, patch.nextFreeId());
    return patch.patch(p.id, Number(v));
  }
</script>

{#each groups as g (g.alias)}
  <section class="dev">
    <h3>{g.name}</h3>
    {#each [{ t: 'Inputs', l: g.inputs }, { t: 'Outputs', l: g.outputs }] as sec (sec.t)}
      {#if sec.l.length}
        <h4>{sec.t}</h4>
        {#each sec.l as p (p.id)}
          <div class="row">
            <span class="lbl">{p.description || p.id}</span>
            <PriorityControl port={p} />
            <select value={p.universe === null ? '' : String(p.universe)} onchange={(e) => assign(p, e.currentTarget.value)} aria-label="Universe for {p.description}">
              <option value="">— not patched —</option>
              {#each patch.universes as u (u.id)}
                <option value={String(u.id)}>U{u.id} · {u.name}</option>
              {/each}
              <option value={NEW}>+ New universe</option>
            </select>
          </div>
        {/each}
      {/if}
    {/each}
  </section>
{:else}
  <p class="empty">No devices found. Check the Plugins tab.</p>
{/each}

<style>
  .dev {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px;
    margin-bottom: 12px;
  }
  h3 {
    margin: 0 0 6px;
  }
  h4 {
    margin: 10px 0 4px;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 8px;
    background: var(--bg);
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .lbl {
    flex: 1 1 160px;
    min-width: 0;
  }
  .empty {
    color: var(--dim);
  }
</style>
