<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    label: string;
    value: number;
    max?: number;
    accent?: boolean;
    tint?: string;
    onchange: (v: number) => void;
  }
  let { label, value, max = 255, accent = false, tint, onchange }: Props = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);
  let activePointer = -1;

  function setFrom(e: PointerEvent) {
    const r = track.getBoundingClientRect();
    const t = 1 - (e.clientY - r.top) / r.height;
    onchange(Math.max(0, Math.min(1, t)) * max);
  }

  // Window-level listeners instead of pointer capture: a mouse drag keeps tracking even
  // when the cursor leaves the strip, and it doesn't depend on capture succeeding.
  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // stop the browser starting a text selection / native drag
    activePointer = e.pointerId;
    dragging = true;
    setFrom(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function move(e: PointerEvent) {
    if (e.pointerId === activePointer) setFrom(e);
  }
  function up(e?: PointerEvent) {
    if (e && e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = -1;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  }
  onDestroy(() => up());
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 16 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onchange(value + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onchange(value - step);
    else return;
    e.preventDefault();
  }
</script>

<div class="fader" class:accent style:--tint={tint}>
  <span class="val">{value}</span>
  <div
    class="track"
    class:dragging
    bind:this={track}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin="0"
    aria-valuemax={max}
    aria-valuenow={value}
    onpointerdown={down}
    onkeydown={key}
  >
    <div class="fill" style:height="{(value / max) * 100}%"></div>
    <div class="cap" style:bottom="calc({(value / max) * 100}% - 14px)"></div>
  </div>
  <span class="lbl">{label}</span>
</div>

<style>
  .fader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
  }
  .val {
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
    color: var(--dim);
  }
  .lbl {
    font-size: 0.8rem;
    font-weight: 600;
  }
  .track {
    position: relative;
    flex: 1;
    width: 100%;
    max-width: 56px;
    min-height: 120px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    touch-action: none; /* we handle the gesture, don't scroll the page */
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
    overflow: hidden;
  }
  .track:focus-visible {
    outline: 2px solid var(--accent);
  }
  .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--tint, var(--fill));
    opacity: 0.55;
  }
  .accent .fill {
    background: var(--accent);
  }
  .cap {
    position: absolute;
    left: 4px;
    right: 4px;
    height: 28px;
    border-radius: 6px;
    background: var(--cap);
    border: 1px solid var(--line);
    box-shadow: 0 2px 6px #0008;
  }
  .dragging .cap {
    background: var(--accent);
  }
</style>
