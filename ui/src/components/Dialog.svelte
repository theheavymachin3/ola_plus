<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, onclose, wide = false, children }: {
    title: string;
    onclose: () => void;
    wide?: boolean;
    children: Snippet;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dialog" class:wide role="dialog" aria-modal="true" aria-label={title}>
  <header>
    <h3>{title}</h3>
    <button onclick={onclose} aria-label="Close">×</button>
  </header>
  <div class="body">{@render children()}</div>
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
    max-height: calc(100dvh - 32px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .dialog.wide {
    width: min(720px, calc(100vw - 24px));
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 12px 0 16px;
  }
  h3 {
    margin: 0;
  }
  .body {
    padding: 12px 16px 16px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
