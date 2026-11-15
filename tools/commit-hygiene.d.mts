export interface Finding { where?: string; rule: string; match: string; fix: string }
export interface Commit { sha: string; authorName: string; authorMail: string; committerName: string; committerMail: string; message: string }
export const NO_REPLY: RegExp;
export const TEXT_RULES: { id: string; fix: string; find: RegExp; prose?: boolean }[];
export function findInText(text: string, options?: { addresses?: boolean; mail?: boolean; prose?: boolean }): Finding[];
export function checkCommit(commit: Commit): (Finding & { where: string })[];
export function addedLines(diff: string): { file: string; line: number; text: string }[];
export function checkDiff(diff: string): (Finding & { where: string })[];
export function checkAll(input: { commits?: Commit[]; diff?: string; title?: string; body?: string | null; branch?: string }): (Finding & { where: string })[];
export function readCommits(base: string, head: string, cwd?: string): Commit[];
