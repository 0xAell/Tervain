export interface SmokeStep { name: string; ok: boolean; detail: string }
export interface SmokePage {
  eval(js: string): Promise<unknown>; wait(ms: number): Promise<void>; cdp(method: string, params?: object): Promise<unknown>;
  image(format?: 'png' | 'jpeg'): Promise<Buffer>; console(): string[];
}
export function waitForRevision(url: string, revision: string | null, options?: { timeoutMs?: number; intervalMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; log?: (line: string) => void }): Promise<{ ok: boolean; unreachable: boolean; revision: string | null; files: number; waitedMs: number; problems: string[]; wanted: string | null }>;
export function imageSpread(png: Buffer): Promise<{ width: number; height: number; min: number; max: number; colours: number }>;
export function smoke(page: SmokePage, options?: { expectVersion?: string | null; outDir?: string | null; log?: (line: string) => void }): Promise<SmokeStep[]>;
