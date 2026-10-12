import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// OLA_URL: where olad (or the mock) listens. `npm run mock` serves on 9090.
const target = process.env.OLA_URL ?? 'http://127.0.0.1:9090';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: {
    host: true,
    proxy: {
      '/json': target,
      '/get_dmx': target,
      '/set_dmx': target,
      '/new_universe': target,
      '/modify_universe': target,
      '/set_plugin_state': target,
      '/reload': target,
      '/reload_pids': target,
    },
  },
});
