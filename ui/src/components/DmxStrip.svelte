<script lang="ts">
  import { heat } from '../lib/monitor/cells';

  // A 512-channel heat strip: one thin column per channel, brighter for higher values.
  let { values, label }: { values: ArrayLike<number> | undefined; label: string } = $props();

  let canvas: HTMLCanvasElement;
  let width = $state(0);

  $effect(() => {
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const h = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    ctx.fillStyle = css.getPropertyValue('--strip-bg') || '#161b22';
    ctx.fillRect(0, 0, width, h);
    const cell = width / 512;
    const lit = css.getPropertyValue('--strip-lit') || '#e8a317';
    ctx.fillStyle = lit;
    for (let i = 0; i < 512; i++) {
      const v = values?.[i] ?? 0;
      if (v <= 0) continue;
      ctx.globalAlpha = heat(v);
      ctx.fillRect(i * cell, 0, Math.max(1, cell), h);
    }
    ctx.globalAlpha = 1;
  });
</script>

<canvas bind:this={canvas} bind:clientWidth={width} aria-label={label}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 22px;
    border-radius: 4px;
    --strip-bg: var(--bg);
    --strip-lit: var(--accent);
  }
</style>
