import { setHostYield } from '../core/util/cooperative';

export { checkCancelled, finishCooperatively, type CooperativeOptions } from '../core/util/cooperative';

/**
 * The longest a turn waits for the browser to paint before going on. A browser whose GPU process is busy (compiling
 * shaders, as a software renderer does for seconds at a time, or a driver that compiles in that process) presents no
 * frame meanwhile, so a turn that waited for one waited for that work: on the four-core test machine without a GPU, the
 * world build's turns waited up to 4.4 s each while the models loaded. The loading screen it would have shown is not
 * drawn either way.
 */
export const PAINT_WAIT_MS = 100;

/** An animation frame alone resumes before paint; its following task lets the browser paint first, and a turn goes on
 * after PAINT_WAIT_MS without one. Hidden tabs use a task because their animation frames can stop altogether. There is
 * no minimum load time. */
export function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    const nextTask = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function' && (typeof document === 'undefined' || !document.hidden)) {
      requestAnimationFrame(nextTask);
      setTimeout(resolve, PAINT_WAIT_MS);
    } else nextTask();
  });
}

// The core's construction work (terrain, navigation) yields this way in the browser unless a caller names another.
setHostYield(yieldToBrowser);
