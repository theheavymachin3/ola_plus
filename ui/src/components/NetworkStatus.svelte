<script lang="ts">
  import { setWifi, type SystemStats } from '../lib/api';
  import WifiDialog from './WifiDialog.svelte';

  let { host }: { host: SystemStats } = $props();

  const wifi = $derived(host.wifi);
  const eth = $derived(host.ethernet);

  // Wi-Fi switch: after a click, show the wanted state until the next reading confirms it.
  let wifiWanted = $state<boolean | null>(null);
  let wifiError = $state('');
  let wifiDialog = $state(false);
  let wifiTimer: ReturnType<typeof setTimeout> | undefined;
  const wifiOn = $derived(wifiWanted ?? wifi?.enabled ?? false);
  $effect(() => {
    if (wifiWanted !== null && wifi?.enabled === wifiWanted) wifiWanted = null;
  });

  async function toggleWifi() {
    if (!wifi || wifiWanted !== null) return;
    const next = !wifi.enabled;
    if (!next && !confirm('Turn Wi-Fi off? If you are connected to this Raspberry Pi over Wi-Fi, you will lose the connection.')) return;
    wifiError = '';
    wifiWanted = next;
    clearTimeout(wifiTimer);
    wifiTimer = setTimeout(() => (wifiWanted = null), 10000);
    try {
      await setWifi(next);
    } catch (e) {
      wifiWanted = null;
      wifiError = e instanceof Error ? e.message : String(e);
    }
  }

  const wifiState = $derived(!wifi ? null : wifi.connected ? 'Connected' : wifi.enabled ? 'Not connected' : 'Off');
</script>

{#if eth || wifi}
  <dl class="links">
    {#if eth}
      <dt>Ethernet</dt>
      <dd class="led"><i class="dot" data-on={eth.connected} aria-hidden="true"></i>{eth.connected ? 'Connected' : 'No cable'}</dd>
    {/if}
    {#if wifi && wifiState}
      <dt>Wi-Fi</dt>
      <dd class="led"><i class="dot" data-on={wifi.connected === true} aria-hidden="true"></i>{wifiState}</dd>
    {/if}
  </dl>
{/if}

{#if wifi}
  {#if wifi.controllable && !wifi.hard_blocked}
    <div class="controls">
      <button class="switch" class:on={wifiOn} role="switch" aria-checked={wifiOn} disabled={wifiWanted !== null} onclick={toggleWifi}>
        <span class="knob"></span>
        Wi-Fi {wifiOn ? 'on' : 'off'}
      </button>
      {#if wifi.enabled}<button onclick={() => (wifiDialog = true)}>Networks…</button>{/if}
    </div>
  {:else}
    <p class="muted note">
      {wifi.hard_blocked ? 'A hardware switch holds Wi-Fi off.' : 'Wi-Fi can’t be switched from here: the ola-plus-net service is not running.'}
    </p>
  {/if}
  {#if wifiError}<p class="err" role="alert">{wifiError}</p>{/if}
{/if}

{#if wifiDialog}<WifiDialog onclose={() => (wifiDialog = false)} />{/if}

<style>
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--dim);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .led {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bad);
    box-shadow: 0 0 6px var(--bad);
    flex: none;
  }
  .dot[data-on='true'] {
    background: var(--good);
    box-shadow: 0 0 6px var(--good);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 999px;
  }
  .knob {
    width: 34px;
    height: 18px;
    border-radius: 999px;
    background: var(--cap);
    position: relative;
    flex: none;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    transition: transform 0.15s;
  }
  .switch.on .knob {
    background: var(--good);
  }
  .switch.on .knob::after {
    transform: translateX(16px);
  }
  .note,
  .err {
    margin: 0;
    font-size: 0.8rem;
  }
  .err {
    color: var(--bad);
  }
</style>
