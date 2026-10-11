export function createLandingQueue() {
  /** @type {Promise<void>} */
  let chain = Promise.resolve();
  return {
    /**
     * @template T
     * @param {() => Promise<T>} job
     * @returns {Promise<T>}
     */
    run(job) {
      const next = chain.then(job, job);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
