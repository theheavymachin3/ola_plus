import {
  fetchPluginInfo,
  fetchUniverseList,
  reloadPlugins,
  setPluginState,
  type PluginInfo,
  type PluginSummary,
} from './api';

class PluginStore {
  plugins = $state<PluginSummary[]>([]);
  info = $state<Record<number, PluginInfo>>({});
  error = $state('');
  busy = $state(false);

  async refresh() {
    try {
      this.plugins = (await fetchUniverseList()).plugins.sort((a, b) => a.name.localeCompare(b.name));
      this.error = '';
    } catch (e) {
      this.error = msg(e);
    }
  }

  async loadInfo(id: number) {
    try {
      this.info[id] = await fetchPluginInfo(id);
    } catch (e) {
      this.error = msg(e);
    }
  }

  async setEnabled(id: number, enabled: boolean) {
    await this.#run(async () => {
      await setPluginState(id, enabled);
      await this.loadInfo(id);
    });
  }

  async reload() {
    await this.#run(async () => {
      await reloadPlugins();
      this.info = {};
    });
  }

  async #run(fn: () => Promise<void>) {
    this.busy = true;
    try {
      await fn();
      this.error = '';
    } catch (e) {
      this.error = msg(e);
    }
    await this.refresh();
    this.busy = false;
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const pluginStore = new PluginStore();
