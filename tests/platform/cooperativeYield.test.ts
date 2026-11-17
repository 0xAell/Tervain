import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAINT_WAIT_MS, yieldToBrowser } from '../../src/platform/cooperative';

// The build's turns wait for a paint so the loading screen can show progress, but not for longer than PAINT_WAIT_MS:
// a browser that presents no frame (its GPU process busy) held every turn until it did.

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('document', { hidden: false });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const settled = (promise: Promise<void>) => { let done = false; void promise.then(() => { done = true; }); return () => done; };

it('goes on after the frame and the task that follows it, when frames come', async () => {
  const done = settled(yieldToBrowser());
  await vi.advanceTimersByTimeAsync(0);
  expect(done()).toBe(false);
  frames.shift()!(16);
  await vi.advanceTimersByTimeAsync(0);
  expect(done()).toBe(true);
});

it('goes on without a frame once it has waited long enough for one', async () => {
  const done = settled(yieldToBrowser());
  await vi.advanceTimersByTimeAsync(PAINT_WAIT_MS - 1);
  expect(done()).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(done()).toBe(true);
  // A frame that comes late changes nothing.
  frames.shift()!(5000);
  await vi.advanceTimersByTimeAsync(0);
  expect(PAINT_WAIT_MS).toBeLessThanOrEqual(250);
});

it('uses a plain task in a hidden tab, whose frames can stop altogether', async () => {
  vi.stubGlobal('document', { hidden: true });
  const done = settled(yieldToBrowser());
  await vi.advanceTimersByTimeAsync(0);
  expect(done()).toBe(true);
  expect(frames).toHaveLength(0);
});
