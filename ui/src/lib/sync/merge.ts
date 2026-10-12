/**
 * Union of two lists of items with an `id`: everything in `remote`, plus the items in `local`
 * that olad has never seen. On the same id the remote copy wins.
 *
 * Used once, the first time a device connects to an olad that already holds data, so what was
 * created offline or before sharing existed is not thrown away. (Ordinary edits never merge:
 * they save against a revision, or adopt the other device's version.)
 */
export function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const known = new Set(remote.map((r) => r.id));
  return [...remote, ...local.filter((l) => !known.has(l.id))];
}
