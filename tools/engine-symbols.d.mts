export interface EngineSymbol {
  symbol: string; kind: string; usedIn: string[]; assumes: string; status: 'verified' | 'partly' | 'unverified' | 'contradicted';
  source: { title: string; url: string } | null; passage: string | null; note: string;
}
export interface EngineSymbolRegister {
  about: string; checked: string; reference: string; statuses: Record<string, string>;
  summary: { symbols: number; verified: number; partly: number; unverified: number; contradicted: number }; symbols: EngineSymbol[];
}
export const REGISTER: string;
export const PAGE: string;
export const STATUSES: readonly string[];
export function readRegister(directory?: string): EngineSymbolRegister;
export function seedFiles(directory?: string): string[];
export function engineNames(directory?: string): { name: string; file: string }[];
export function registerProblems(register: EngineSymbolRegister, directory?: string): string[];
export function page(register: EngineSymbolRegister): string;
export function onlineProblems(register: EngineSymbolRegister, load: (url: string) => Promise<string>): Promise<{ problems: string[]; pages: number; read: number }>;
