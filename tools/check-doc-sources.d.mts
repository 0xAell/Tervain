export interface SourceRegister {
  checked?: string; documents?: string[];
  sources?: Record<string, { publisher?: string; title?: string; url?: string; read?: string }>;
  passages?: { source: string; text: string; says?: string; in?: string[] }[];
  rows?: { source: string; label: string; cells: string[]; in: string; as: string }[];
  cited?: string[]; terms?: string[];
}
export const REGISTER: string;
export function plain(text: unknown): string;
export function pageText(html: string): string;
export function pageRows(html: string): string[][];
export function unmarked(markdown: string): string;
export function blocks(markdown: string): string[];
export function quotedPassages(markdown: string): string[];
export function tableRows(markdown: string): string[][];
export function registerProblems(register: SourceRegister, read?: (file: string) => string): string[];
export function pageProblems(register: SourceRegister, id: string, html: string): string[];
