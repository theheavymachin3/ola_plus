<script lang="ts">
  import { hold } from '../lib/hold';
  import { mixer } from '../lib/mixer.svelte';
  import { sceneMatches, type Scene } from '../lib/scenes/model';
  import { player } from '../lib/scenes/player.svelte';

  let { scene, onedit }: { scene: Scene; onedit: () => void } = $props();

  const fading = $derived(player.fadingId === scene.id);
  const fadingOut = $derived(fading && player.fadingDir === 'out');
  const bumping = $derived(player.bumpId === scene.id);
  // "Active" is what the stage actually shows, not just what was last pressed.
  const active = $derived(!fading && sceneMatches(scene, mixer.levels));
  // On while it sits at its levels or is fading up to them. A tap then switches it off;
  // a tap on anything else (including mid fade-out) switches it on.
  const on = $derived(active || (fading && !fadingOut));

  const toggle = () => (on ? player.off(scene) : player.go(scene));
  const state = $derived(fadingOut ? 'fading out' : fading ? 'fading in' : active ? 'on' : '');
</script>

<div class="pad" class:active class:fading class:bumping>
  <button class="go" onclick={toggle} aria-pressed={on} aria-label="{scene.name}: tap to switch {on ? 'off' : 'on'}">
    <span class="name">{scene.name}{#if state}<em>{state}</em>{/if}</span>
    <small>
      {scene.fade > 0 ? `${scene.fade}s fade` : 'snap'} · {scene.levels.length} ch · {scene.replace ? 'look' : 'accent'}
    </small>
    {#if fading}<span class="bar" style:width="{player.progress * 100}%"></span>{/if}
  </button>
  <div class="side">
    <button class="bump" use:hold={{ down: () => player.bumpOn(scene), up: () => player.bumpOff() }} aria-label="Bump {scene.name} (hold)">
      Bump
    </button>
    <button class="edit" onclick={onedit} aria-label="Edit {scene.name}">⋯</button>
  </div>
</div>

<style>
  .pad {
    display: grid;
    grid-template-columns: 1fr auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    min-height: 96px;
  }
  .pad.active {
    border-color: var(--good);
  }
  .pad.bumping {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .go {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    padding: 12px 14px;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: hidden;
  }
  .pad.active .go {
    background: color-mix(in srgb, var(--good) 14%, transparent);
  }
  .name {
    font-weight: 700;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  .name em {
    margin-left: 8px;
    font-size: 0.7rem;
    font-style: normal;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--good);
  }
  .pad.fading .name em {
    color: var(--accent);
  }
  small {
    color: var(--dim);
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 5px;
    background: var(--fill);
  }
  .side {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--line);
  }
  .side button {
    flex: 1;
    border: none;
    border-radius: 0;
    min-width: 72px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .bump {
    background: var(--cap);
    font-weight: 600;
  }
  .bump:active,
  .pad.bumping .bump {
    background: var(--accent);
    color: #000;
  }
  .edit {
    border-top: 1px solid var(--line) !important;
    min-height: 36px;
  }
</style>
