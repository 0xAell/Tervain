/** Construction work may run while the application keeps a loading screen visible. */
export interface CooperativeOptions {
  yieldNow?: () => Promise<void>;
  signal?: AbortSignal;
  /** Maximum work per turn, checked between complete rows/tiles. Zero is useful for deterministic hosts. */
  budgetMs?: number;
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Loading was cancelled.', 'AbortError');
}

/** How a turn is given back to the host when the caller names no way of its own: a plain task here.
 * A host with a display installs its own (the browser's waits for a paint, src/platform/cooperative.ts). */
let hostYield: () => Promise<void> = () => new Promise(resolve => { setTimeout(resolve, 0); });

export function setHostYield(yieldNow: () => Promise<void>): void {
  hostYield = yieldNow;
}

/** Consume bounded construction batches. Closing the generator also runs its allocation cleanup on cancellation. */
export async function finishCooperatively<T, P>(steps: Generator<P, T>, options: CooperativeOptions & { onProgress?: (progress: P) => void } = {}): Promise<T> {
  const budget = Math.max(0, options.budgetMs ?? 8);
  let deadline = performance.now() + budget;
  try {
    for (;;) {
      checkCancelled(options.signal);
      const next = steps.next();
      if (next.done) return next.value;
      options.onProgress?.(next.value);
      if (performance.now() >= deadline) {
        await (options.yieldNow ?? hostYield)();
        deadline = performance.now() + budget;
      }
    }
  } finally {
    steps.return(undefined as T);
  }
}
