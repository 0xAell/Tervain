import { setHostYield } from '../core/util/cooperative';

export { checkCancelled, finishCooperatively, type CooperativeOptions } from '../core/util/cooperative';

/** An animation frame alone resumes before paint; its following task lets the browser paint first.
 * Hidden tabs use a task because their animation frames can stop altogether. There is no minimum load time. */
export function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    const nextTask = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function' && (typeof document === 'undefined' || !document.hidden)) requestAnimationFrame(nextTask);
    else nextTask();
  });
}

// The core's construction work (terrain, navigation) yields this way in the browser unless a caller names another.
setHostYield(yieldToBrowser);
