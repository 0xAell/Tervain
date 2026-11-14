// Everything the engine-agnostic core (src/core) may use from its host besides the ECMAScript standard library.
// tsconfig.core.json checks the core against ES2023 alone (no DOM, no Node, no renderer) plus these few declarations,
// so a new dependency on a browser or Node API fails `npm run typecheck`. Keep this list short: each entry is
// something an Unreal port has to provide or replace.
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function structuredClone<T>(value: T): T;
declare const performance: { now(): number };
declare const console: { warn(...data: unknown[]): void };
interface AbortSignal { readonly aborted: boolean; readonly reason: unknown }
declare class DOMException extends Error { constructor(message?: string, name?: string); }
