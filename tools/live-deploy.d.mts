export interface DeployState { ok: boolean; revision: string | null; files: number; problems: string[] }
export function pageFiles(html: string, base: string): string[];
export function importedFiles(script: string, address: string): string[];
export function deployState(url: string, fetchImpl?: typeof fetch): Promise<DeployState>;
export function waitForSettledDeploy(url: string, options?: { timeoutMs?: number; intervalMs?: number; steady?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (line: string) => void; now?: () => number }): Promise<DeployState & { waitedMs: number }>;
