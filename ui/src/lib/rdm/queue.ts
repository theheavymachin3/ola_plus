/**
 * Runs tasks one after another. RDM interfaces handle a single request at a time (a second one
 * is dropped), so every call that ends up on the wire goes through one of these.
 */
export class SerialQueue {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task);
    this.#tail = result.catch(() => undefined); // a failed task doesn't stop the ones behind it
    return result;
  }
}
