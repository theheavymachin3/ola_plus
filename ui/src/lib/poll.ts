/**
 * Run `task` now and then every `ms`, never overlapping itself (a slow olad can't pile up
 * requests) and ignoring errors from the task. Returns a function that stops it.
 */
export function startPolling(task: () => Promise<void>, ms: number): () => void {
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await task();
    } catch {
      /* the task reports its own failures */
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, ms);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
