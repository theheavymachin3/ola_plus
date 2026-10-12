// Browse and download profiles straight from the Open Fixture Library repo on GitHub.
// Manufacturer list + fixture files come from raw.githubusercontent.com; listing one
// manufacturer's fixtures uses the GitHub contents API (60 requests/hour unauthenticated),
// so results are cached for the session.
import { parseOfl, type OflResult } from './ofl';

const RAW = 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/fixtures';
const API = 'https://api.github.com/repos/OpenLightingProject/open-fixture-library/contents/fixtures';

export interface Manufacturer {
  key: string;
  name: string;
}

// Some entries in the library are all-lowercase ("cameo"); title-case those only.
const prettify = (n: string) =>
  n === n.toLowerCase() ? n.replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase()) : n;

let manufacturers: Manufacturer[] | undefined;
const fixtureLists = new Map<string, string[]>();

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (r.status === 403 || r.status === 429) {
    throw new Error('GitHub rate limit reached — try again later, or paste the fixture JSON instead.');
  }
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

export async function listManufacturers(): Promise<Manufacturer[]> {
  if (manufacturers) return manufacturers;
  const j = (await getJson(`${RAW}/manufacturers.json`)) as Record<string, { name?: string }>;
  manufacturers = Object.entries(j)
    .filter(([k]) => !k.startsWith('$'))
    .map(([key, v]) => ({ key, name: prettify(v.name ?? key) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return manufacturers;
}

/** Fixture keys (file names without .json) for one manufacturer. */
export async function listFixtures(manufacturerKey: string): Promise<string[]> {
  const hit = fixtureLists.get(manufacturerKey);
  if (hit) return hit;
  const j = (await getJson(`${API}/${encodeURIComponent(manufacturerKey)}`)) as { name: string }[];
  const keys = j.filter((f) => f.name.endsWith('.json')).map((f) => f.name.slice(0, -5));
  fixtureLists.set(manufacturerKey, keys);
  return keys;
}

export async function fetchProfile(m: Manufacturer, fixtureKey: string): Promise<OflResult> {
  const json = await getJson(`${RAW}/${encodeURIComponent(m.key)}/${encodeURIComponent(fixtureKey)}.json`);
  return parseOfl(json, m.name, `${m.key}/${fixtureKey}`);
}
