<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWifi, fetchWifiNetworks, scanWifi, type WifiConnectResult, type WifiNetwork } from '../lib/api';
  import { startPolling } from '../lib/poll';
  import { isEnterprise, isOpen, listNetworks, securityLabel, validPassphrase } from '../lib/wifi/networks';
  import Dialog from './Dialog.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let networks = $state<WifiNetwork[]>([]);
  let scanning = $state(true);
  let result = $state<WifiConnectResult | null>(null);
  let error = $state('');

  // What the person is joining: a listed network, or a typed name for a hidden one.
  let chosen = $state<WifiNetwork | null>(null);
  let other = $state(false);
  let ssid = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let asked = $state(0); // when the last connect was asked (ms), to ignore an older result

  const list = $derived(listNetworks(networks));
  const joining = $derived(result?.status === 'connecting');
  const target = $derived(other ? ssid.trim() : (chosen?.ssid ?? ''));
  const needsPassword = $derived(other || (chosen !== null && !isOpen(chosen.security)));
  const canConnect = $derived(
    target !== '' && !joining && (!needsPassword || (other && password === '') || validPassphrase(password)),
  );

  async function rescan() {
    scanning = true;
    try {
      await scanWifi();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void rescan();
    return startPolling(async () => {
      const r = await fetchWifiNetworks();
      networks = r.networks;
      // Show a result only if it is from this attempt; before any, only one still in progress.
      const fresh =
        r.connect && (asked === 0 ? r.connect.status === 'connecting' : Date.now() - r.connect.age_s * 1000 >= asked - 2000);
      result = fresh ? r.connect! : null;
      if (r.scan_age_s !== undefined && r.scan_age_s < 20) scanning = false;
    }, 2000);
  });

  function pick(n: WifiNetwork) {
    chosen = n;
    other = false;
    password = '';
    error = '';
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canConnect) return;
    error = '';
    asked = Date.now();
    result = { status: 'connecting', ssid: target, message: '', age_s: 0 };
    try {
      await connectWifi(target, password, other);
    } catch (err) {
      result = null;
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<Dialog title="Wi-Fi networks" {onclose}>
  <p class="warn">
    Joining a network moves the Raspberry Pi off the one it is on now. If you are using this page over Wi-Fi it will stop
    answering at this address; find the Pi again on the new network.
  </p>

  <div class="bar">
    <span class="muted">{scanning ? 'Scanning…' : `${list.length} network${list.length === 1 ? '' : 's'} in range`}</span>
    <button onclick={rescan} disabled={scanning || joining}>Scan again</button>
  </div>

  <ul>
    {#each list as n (n.ssid)}
      <li>
        <button
          class="net"
          class:sel={!other && chosen?.ssid === n.ssid}
          disabled={joining || isEnterprise(n.security)}
          onclick={() => pick(n)}
          title={isEnterprise(n.security) ? 'Company networks (802.1X) can’t be joined from here' : ''}
        >
          <span class="ssid">{n.ssid}</span>
          {#if n.in_use}<span class="tag">Connected</span>{/if}
          <span class="muted">{securityLabel(n.security)}</span>
          <span class="bars" aria-label="signal {n.signal}%"><i style="width:{n.signal}%"></i></span>
        </button>
      </li>
    {/each}
    <li>
      <button class="net" class:sel={other} disabled={joining} onclick={() => ((other = true), (chosen = null), (password = ''))}>
        <span class="ssid">Other network…</span>
        <span class="muted">hidden</span>
      </button>
    </li>
  </ul>

  {#if chosen || other}
    <form onsubmit={submit}>
      {#if other}
        <label>
          Network name
          <input type="text" bind:value={ssid} maxlength="32" autocomplete="off" disabled={joining} />
        </label>
      {/if}
      {#if needsPassword}
        <label>
          Password{other ? ' (leave empty for an open network)' : ''}
          <span class="pw">
            <input
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              maxlength="63"
              autocomplete="off"
              disabled={joining}
            />
            <button type="button" onclick={() => (showPassword = !showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        {#if password !== '' && !validPassphrase(password)}
          <p class="muted note">A Wi-Fi password is 8 to 63 characters.</p>
        {/if}
      {/if}
      <button class="go" type="submit" disabled={!canConnect}>{joining ? 'Connecting…' : `Connect to ${target || '…'}`}</button>
    </form>
  {/if}

  {#if result && result.status !== 'connecting'}
    <p class="result" data-state={result.status} role="status">
      {result.status === 'ok' ? `Connected to ${result.ssid}.` : `Could not connect to ${result.ssid}: ${result.message || 'unknown error'}`}
    </p>
  {/if}
  {#if error}<p class="result" data-state="failed" role="alert">{error}</p>{/if}
</Dialog>

<style>
  .warn {
    margin: 0 0 8px;
    font-size: 0.8rem;
    color: var(--accent);
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 40vh;
    overflow: auto;
  }
  .net {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  .net.sel {
    border-color: var(--accent);
  }
  .ssid {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 0.7rem;
    color: var(--good);
  }
  .bars {
    width: 40px;
    height: 6px;
    border-radius: 3px;
    background: var(--cap);
    flex: none;
    overflow: hidden;
  }
  .bars i {
    display: block;
    height: 100%;
    background: var(--good);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--dim);
  }
  .pw {
    display: flex;
    gap: 6px;
  }
  .pw input {
    flex: 1;
    min-width: 0;
  }
  input {
    color: var(--text);
    font-size: 1rem;
  }
  .note {
    margin: 0;
    font-size: 0.75rem;
  }
  .result {
    margin: 10px 0 0;
    font-size: 0.9rem;
  }
  .result[data-state='ok'] {
    color: var(--good);
  }
  .result[data-state='failed'] {
    color: var(--bad);
  }
</style>
