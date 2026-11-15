export interface ProbeState { booted: boolean; ready: boolean; failed: boolean; text: string; bad: string[]; resources: string[]; rejections: string[] }
export const PROBE_INIT: string;
export const PROBE_STATE: string;
export class LoadFailure extends Error { state: ProbeState | null; constructor(message: string, state: ProbeState | null) }
export function loadFailure(state: Partial<ProbeState> | null): string | null;
export function describeState(state: Partial<ProbeState> | null, consoleLines?: string[]): string[];
export function waitUntilReady(page: { eval(js: string): Promise<unknown>; wait(ms: number): Promise<void>; console?(): string[] }, options?: { polls?: number; pollMs?: number; label?: string }): Promise<ProbeState>;
