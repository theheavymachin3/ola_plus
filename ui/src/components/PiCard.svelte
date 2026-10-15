<script lang="ts">
  import WifiDialog from './WifiDialog.svelte';
  import { setWifi, type SystemStats } from '../lib/api';
  import { decodeThrottled, formatUptime, memoryUsedPercent, tempLevel } from '../lib/overview/health';

  let { host }: { host: SystemStats } = $props();

  const fw = $derived(host.firmware);
  const flags = $derived(fw?.throttled !== undefined ? decodeThrottled(fw.throttled) : null);
  const memUsed = $derived(memoryUsedPercent(host));
  const level = $derived(host.cpu_temp_c === undefined ? 'ok' : tempLevel(host.cpu_temp_c));
  const underNow = $derived(host.undervoltage_alarm === true || (flags?.now.includes('under-voltage') ?? false));
  // Wi-Fi switch: after a click, show the wanted state until the next reading confirms it.
  const wifi = $derived(host.wifi);
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

  const volt = (v: number | undefined) => (v === undefined ? '—' : `${v.toFixed(3)} V`);

  // Power: what the firmware says if we have it, else only the kernel's alarm.
  const power = $derived.by(() => {
    if (underNow) return { text: 'Under-voltage now', state: 'bad' };
    if (flags?.past.includes('under-voltage')) return { text: 'Under-voltage earlier', state: 'warn' };
    if (flags || host.undervoltage_alarm === false) return { text: 'OK', state: 'ok' };
    return null;
  });
</script>

<article class="card">
  <h3>{host.platform === 'raspberry-pi' ? 'Raspberry Pi' : 'Host'}</h3>
  {#if host.model}<p class="muted model" title={host.model}>{host.model}</p>{/if}
  <dl>
    {#if host.cpu_temp_c !== undefined}
      <dt>CPU temperature</dt><dd class="v" data-state={level}>{host.cpu_temp_c.toFixed(1)} °C</dd>
    {/if}
    {#if host.cpu_freq_mhz !== undefined}
      <dt>CPU clock</dt>
      <dd>{host.cpu_freq_mhz} MHz{host.cpu_max_freq_mhz ? ` of ${host.cpu_max_freq_mhz}` : ''}</dd>
    {/if}
    {#if host.load}
      <dt>Load (1/5/15 min)</dt><dd>{host.load.map((l) => l.toFixed(2)).join(' · ')}</dd>
    {/if}
    {#if memUsed !== null}
      <dt>Memory used</dt><dd>{memUsed}%</dd>
    {/if}
    {#if host.uptime_s !== undefined}
      <dt>Uptime</dt><dd>{formatUptime(host.uptime_s)}</dd>
    {/if}
    {#if power}
      <dt>Power</dt><dd class="v" data-state={power.state}>{power.text}</dd>
    {/if}
    {#if flags && flags.now.filter((f) => f !== 'under-voltage').length}
      <dt>Right now</dt><dd class="v" data-state="warn">{flags.now.filter((f) => f !== 'under-voltage').join(', ')}</dd>
    {/if}
    {#if flags && flags.past.length}
      <dt>Since boot</dt><dd class="v" data-state="warn">{flags.past.join(', ')}</dd>
    {/if}
  </dl>
  {#if wifi}
    <h4>Network</h4>
    {#if wifi.controllable && !wifi.hard_blocked}
      <button class="switch" class:on={wifiOn} role="switch" aria-checked={wifiOn} disabled={wifiWanted !== null} onclick={toggleWifi}>
        <span class="knob"></span>
        Wi-Fi {wifiOn ? 'on' : 'off'}
      </button>
      {#if wifi.enabled}<button class="networks" onclick={() => (wifiDialog = true)}>Networks…</button>{/if}
    {:else}
      <p class="muted note">
        Wi-Fi is {wifi.enabled ? 'on' : 'off'}.
        {wifi.hard_blocked ? 'A hardware switch holds it off.' : 'It can\'t be switched from here: the ola-plus-net service is not running.'}
      </p>
    {/if}
    {#if wifiError}<p class="err" role="alert">{wifiError}</p>{/if}
  {/if}
  {#if fw}
    <h4>Voltages</h4>
    <dl>
      <dt>Core</dt><dd>{volt(fw.volts.core)}</dd>
      <dt>SDRAM core</dt><dd>{volt(fw.volts.sdram_c)}</dd>
      <dt>SDRAM I/O</dt><dd>{volt(fw.volts.sdram_i)}</dd>
      <dt>SDRAM PHY</dt><dd>{volt(fw.volts.sdram_p)}</dd>
    </dl>
    <p class="muted note">These are the chip's internal rails. The 5 V supply is not measurable: the Pi only reports whether it dropped too low.</p>
  {:else if host.platform === 'raspberry-pi'}
    <p class="muted note">Voltages and throttling flags are not available: the ola-plus-sysinfo service is not running.</p>
  {/if}
</article>

{#if wifiDialog}<WifiDialog onclose={() => (wifiDialog = false)} />{/if}

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  h4 {
    margin: 6px 0 0;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  p {
    margin: 0;
  }
  .model {
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    font-size: 0.75rem;
  }
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
    overflow-wrap: anywhere;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 999px;
    align-self: flex-start;
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
  .networks {
    align-self: flex-start;
  }
  .err {
    color: var(--bad);
    font-size: 0.8rem;
  }
  .v[data-state='ok'] {
    color: var(--good);
  }
  .v[data-state='warn'] {
    color: var(--accent);
  }
  .v[data-state='bad'] {
    color: var(--bad);
  }
</style>
