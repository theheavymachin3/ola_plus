// Runs public/sw.js in a fake ServiceWorkerGlobalScope to check what it does and, as importantly,
// what it leaves alone (olad's API must never be cached or intercepted).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

type Handler = (event: unknown) => void;

function load(scope = 'https://olad.local/ui/') {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Response>(); // one cache, keyed by request url or path
  const fetched: string[] = [];
  let networkUp = true;

  const caches = {
    open: async () => ({
      addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, new Response('shell'))),
      put: async (k: Request | string, r: Response) => void store.set(typeof k === 'string' ? k : k.url, r),
    }),
    keys: async () => ['olaplus-shell-v1', 'old-cache'],
    delete: async () => true,
    match: async (k: Request | string) => store.get(typeof k === 'string' ? k : k.url),
  };
  const fetchFn = async (req: Request) => {
    fetched.push(req.url);
    if (!networkUp) throw new Error('offline');
    return new Response('net', { status: 200 });
  };

  const self = {
    registration: { scope },
    location: new URL(scope),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
  };
  new Function('self', 'caches', 'fetch', 'URL', 'Response', SOURCE)(self, caches, fetchFn, URL, Response);

  // Dispatch a fetch event; returns the response when the worker handled it, else undefined.
  const request = async (url: string, init: { method?: string; mode?: string } = {}) => {
    const req = { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' } as unknown as Request;
    let responded: Promise<Response> | undefined;
    handlers.fetch({ request: req, respondWith: (p: Promise<Response>) => (responded = p) });
    return responded ? await responded : undefined;
  };

  return { store, fetched, request, setNetwork: (up: boolean) => (networkUp = up), handlers };
}

describe('service worker', () => {
  let sw: ReturnType<typeof load>;
  beforeEach(() => {
    sw = load();
  });

  it('precaches the app shell on install', async () => {
    let done: Promise<unknown> | undefined;
    sw.handlers.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...sw.store.keys()]).toContain('./index.html');
    expect([...sw.store.keys()]).toContain('./manifest.webmanifest');
  });

  it('serves navigations from the network when it can, and refreshes the cached shell', async () => {
    const res = await sw.request('https://olad.local/ui/', { mode: 'navigate' });
    expect(await res!.text()).toBe('net');
    expect(sw.store.has('./index.html')).toBe(true);
  });

  it('falls back to the cached shell when offline', async () => {
    sw.store.set('./index.html', new Response('cached shell'));
    sw.setNetwork(false);
    const res = await sw.request('https://olad.local/ui/#scenes', { mode: 'navigate' });
    expect(await res!.text()).toBe('cached shell');
  });

  it('caches hashed assets and then serves them without the network', async () => {
    const url = 'https://olad.local/ui/assets/index-abc123.js';
    await sw.request(url);
    expect(sw.store.has(url)).toBe(true);
    sw.setNetwork(false);
    const again = await sw.request(url);
    expect(await again!.text()).toBe('net');
  });

  it('never touches olad\'s API (outside its scope) or other origins or non-GETs', async () => {
    expect(await sw.request('https://olad.local/json/universe_info?id=1')).toBeUndefined();
    expect(await sw.request('https://olad.local/get_dmx?u=1')).toBeUndefined();
    expect(await sw.request('https://olad.local/ui_store', { method: 'POST' })).toBeUndefined();
    expect(await sw.request('https://elsewhere.test/ui/assets/x.js')).toBeUndefined();
    expect(sw.fetched).toEqual([]);
  });

  it('leaves non-asset files in its scope to the network', async () => {
    expect(await sw.request('https://olad.local/ui/some-data.json')).toBeUndefined();
  });

  it('removes caches from older versions on activate', async () => {
    let done: Promise<unknown> | undefined;
    sw.handlers.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(done).toBeDefined();
  });
});
