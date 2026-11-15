import { afterEach, describe, expect, it } from 'vitest';
import { checkCancelled, finishCooperatively, setHostYield } from '../../../src/core/util/cooperative';

function* count(steps: number): Generator<number, string> {
  for (let step = 1; step <= steps; step++) yield step;
  return 'done';
}

const plainTask = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

describe('cooperative construction', () => {
  afterEach(() => setHostYield(plainTask));

  it('lets a live signal pass and throws an aborted one\'s reason', () => {
    expect(() => checkCancelled()).not.toThrow();
    expect(() => checkCancelled(new AbortController().signal)).not.toThrow();
    const controller = new AbortController();
    controller.abort(new Error('the player left'));
    expect(() => checkCancelled(controller.signal)).toThrow('the player left');
  });

  it('runs the work to its value and reports every step', async () => {
    const seen: number[] = [];
    await expect(finishCooperatively(count(4), { budgetMs: 1000, onProgress: (step) => seen.push(step) })).resolves.toBe('done');
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('does not give the turn back while the budget lasts', async () => {
    let yields = 0;
    await finishCooperatively(count(5), { budgetMs: 60_000, yieldNow: async () => { yields++; } });
    expect(yields).toBe(0);
  });

  it('gives the turn back after each step when the budget is zero, through the caller\'s own yield', async () => {
    let yields = 0, hostYields = 0;
    setHostYield(async () => { hostYields++; });
    await finishCooperatively(count(3), { budgetMs: 0, yieldNow: async () => { yields++; } });
    expect(yields).toBe(3);
    expect(hostYields).toBe(0);
  });

  it('uses the host\'s yield when the caller names none', async () => {
    let hostYields = 0;
    setHostYield(async () => { hostYields++; });
    await expect(finishCooperatively(count(2), { budgetMs: 0 })).resolves.toBe('done');
    expect(hostYields).toBe(2);
  });

  it('stops at a cancelled signal and closes the work so its cleanup runs', async () => {
    const controller = new AbortController();
    let cleaned = false, reached = 0;
    function* work(): Generator<number, string> {
      try {
        reached = 1; yield 1;
        controller.abort(new Error('stopped'));
        reached = 2; yield 2;
        reached = 3; yield 3;
      } finally { cleaned = true; }
      return 'done';
    }
    await expect(finishCooperatively(work(), { signal: controller.signal, budgetMs: 1000 })).rejects.toThrow('stopped');
    expect(reached).toBe(2);
    expect(cleaned).toBe(true);
  });

  it('never starts work whose signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('too late'));
    let started = false;
    function* work(): Generator<number, string> { started = true; yield 1; return 'done'; }
    await expect(finishCooperatively(work(), { signal: controller.signal })).rejects.toThrow('too late');
    expect(started).toBe(false);
  });
});
