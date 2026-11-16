import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { engineNames, onlineProblems, page, PAGE, readRegister, registerProblems, seedFiles, STATUSES, type EngineSymbolRegister } from '../../tools/engine-symbols.mjs';

// The Unreal seed has never been built by the engine. docs/unreal/engine-symbols.json lists every engine name the
// seed and its stand-ins assume, the page of Epic's public documentation each was checked against, and what could not
// be checked. This test keeps the list complete and honest: an engine name that is used but not entered fails it.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const register = readRegister(root);
const copy = () => JSON.parse(JSON.stringify(register)) as EngineSymbolRegister;

describe('the register of engine names the Unreal seed assumes', () => {
  it('has no problem: every entry is complete, and every engine name in the seed and the stand-ins is entered', () => {
    expect(registerProblems(register, root)).toEqual([]);
  });

  it('finds the engine names in the code: types, macros, members, specifiers and headers', () => {
    const names = engineNames(root).map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(80);
    for (const name of ['FString', 'TArray', 'UDataTable', 'UE_LOG', 'GENERATED_BODY', 'IMPLEMENT_PRIMARY_GAME_MODULE', 'FMath::RoundToInt32', 'FPaths::ProjectDir', '.TryGetNumberField', '.TryLoad',
      'specifier EditAnywhere', 'specifier BlueprintType', 'Engine/DataTable.h', 'Templates/Casts.h', 'CoreMinimal.h']) expect(names, name).toContain(name);
    // The project's own names and the stand-ins' helpers are not the engine's.
    expect(names.filter((name) => /Tervain|StandIn|STANDIN/.test(name))).toEqual([]);
  });

  it('fails when a name is used and not entered, when a file is misnamed and when the summary is off', () => {
    const missing = copy();
    missing.symbols = missing.symbols.filter((entry) => entry.symbol !== 'UDataTable::FindRow' && entry.symbol !== 'Templates/Casts.h');
    missing.summary.symbols -= 2; missing.summary.verified -= 2;
    expect(registerProblems(missing, root).join('\n')).toMatch(/Templates\/Casts\.h \(in unreal\/Source\/Tervain\/Private\/TervainDataSubsystem\.cpp\) is not in the register/);
    const wrongFile = copy();
    wrongFile.symbols[0]!.usedIn = ['unreal/Source/Tervain/Public/NoSuchFile.h'];
    expect(registerProblems(wrongFile, root).join('\n')).toMatch(/NoSuchFile\.h, which is not a file of the seed or the stand-ins/);
    const miscounted = copy();
    miscounted.summary.verified += 1;
    expect(registerProblems(miscounted, root).join('\n')).toMatch(/the summary does not match the entries/);
    const unsourced = copy();
    const verified = unsourced.symbols.find((entry) => entry.status === 'verified')!;
    verified.source = null; verified.passage = null;
    expect(registerProblems(unsourced, root).join('\n')).toMatch(/cites no page of Epic's documentation/);
    // A rule of the language cites the C++20 working draft, and only that.
    const language = copy();
    language.symbols.find((entry) => entry.kind === 'language')!.source!.url = 'https://dev.epicgames.com/documentation/en-us/unreal-engine/epic-cplusplus-coding-standard-for-unreal-engine';
    expect(registerProblems(language, root).join('\n')).toMatch(/cites no section of the C\+\+20 working draft/);
  });

  it('names only files of the seed and the stand-ins, and every such C++ file is named by some entry', () => {
    const files = seedFiles(root), used = new Set(register.symbols.flatMap((entry) => entry.usedIn));
    for (const file of files.filter((name) => /\.(h|cpp|cs|uproject|ini)$/.test(name))) expect(used.has(file), file).toBe(true);
  });

  it('says plainly what is not settled: nothing is called verified without a page and a passage', () => {
    for (const entry of register.symbols) {
      if (entry.status === 'unverified') { expect(entry.source, entry.symbol).toBeNull(); expect(entry.passage, entry.symbol).toBeNull(); continue; }
      expect(entry.source!.url, entry.symbol).toMatch(entry.kind === 'language' ? /^https:\/\/raw\.githubusercontent\.com\/cplusplus\/draft\/n4861\/source\// : /^https:\/\/dev\.epicgames\.com\/documentation\/en-us\/unreal-engine\//);
      expect(entry.passage!.length, entry.symbol).toBeGreaterThanOrEqual(20);
    }
    const open = register.symbols.filter((entry) => entry.status !== 'verified');
    expect(open.length).toBe(register.summary.partly + register.summary.unverified + register.summary.contradicted);
    // The one page that contradicts the seed is recorded as such, not explained away.
    expect(register.symbols.filter((entry) => entry.status === 'contradicted').map((entry) => entry.symbol)).toEqual(['IMPLEMENT_PRIMARY_GAME_MODULE']);
    expect(STATUSES).toEqual(Object.keys(register.statuses));
  });

  it('records a corroboration beside a status, never in place of one', () => {
    const backed = register.symbols.filter((entry) => entry.corroboration);
    expect(backed.map((entry) => [entry.symbol, entry.status])).toEqual([
      ['IMPLEMENT_PRIMARY_GAME_MODULE', 'contradicted'], ['BuildSettingsVersion.Latest', 'partly'], ['EngineIncludeOrderVersion.Latest', 'unverified'],
    ]);
    for (const entry of backed) expect(entry.corroboration!.url, entry.symbol).toMatch(/^https:\/\/raw\.githubusercontent\.com\/carla-simulator\/carla\/ue5-dev\//);
    const onVerified = copy();
    onVerified.symbols.find((entry) => entry.status === 'verified')!.corroboration = backed[0]!.corroboration;
    expect(registerProblems(onVerified, root).join('\n')).toMatch(/is verified and needs no corroboration/);
    const unquoted = copy();
    unquoted.symbols.find((entry) => entry.corroboration)!.corroboration!.passage = 'short';
    expect(registerProblems(unquoted, root).join('\n')).toMatch(/has a corroboration without a title, an address and a quoted line/);
    expect(page(register)).toContain(`${backed.length} of them are corroborated`);
  });

  it('has a page that is exactly what the register gives', () => {
    expect(readFileSync(resolve(root, PAGE), 'utf8')).toBe(page(register));
    const text = page(register);
    expect(text).toContain(`| verified | ${register.summary.verified} |`);
    for (const entry of register.symbols.filter((item) => item.status !== 'verified')) expect(text, entry.symbol).toContain(`\`${entry.symbol.replace(/\|/g, '\\|')}\``);
  });

  it('checks each passage on its page when asked to, and opens a page again before calling a passage missing', async () => {
    const small = copy();
    small.symbols = small.symbols.filter((entry) => entry.source).slice(0, 3);
    const wrap = (text: string) => `<html><body><p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p></body></html>`;
    const opened: string[] = [];
    const good = await onlineProblems(small, async (url) => { opened.push(url); return wrap(small.symbols.filter((entry) => entry.source!.url === url).map((entry) => entry.passage).join(' and ')); });
    expect(good.problems).toEqual([]);
    // A page that arrives cut short the first time is read again; one that never holds the passage is reported.
    let calls = 0;
    const flaky = await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => (calls++ === 0 ? wrap('cut short') : wrap(small.symbols[0]!.passage!)));
    expect(flaky.problems).toEqual([]);
    expect(calls).toBe(2);
    // So is a page that arrives whole but without its tables, up to three times in all.
    let served = 0;
    const thin = await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => (served++ < 2 ? wrap('the page without its tables') : wrap(small.symbols[0]!.passage!)));
    expect(thin.problems).toEqual([]);
    expect(served).toBe(3);
    let asked = 0;
    const bad = await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => { asked++; return wrap('something else entirely'); });
    expect(bad.problems.join('\n')).toMatch(/the passage is not on https:\/\/dev\.epicgames\.com/);
    expect(asked).toBe(3);
    const down = await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => { throw new Error('status 503'); });
    expect(down.problems.join('\n')).toMatch(/could not be read: status 503/);
    // A page that starts as HTML and never closes is fetched again; one that never arrives whole is reported as such, and
    // its passages are not called missing.
    const whole = wrap(small.symbols[0]!.passage!);
    let tries = 0;
    expect((await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => (tries++ < 2 ? whole.slice(0, -20) : whole))).problems).toEqual([]);
    expect(tries).toBe(3);
    const truncated = await onlineProblems({ ...small, symbols: small.symbols.slice(0, 1) }, async () => whole.slice(0, -20));
    expect(truncated.problems.join('\n')).toMatch(/arrived cut short 3 times/);
    expect(truncated.problems.join('\n')).not.toMatch(/the passage is not on/);
    // A corroborating line is looked for in its file as a passage is on its page.
    const backed = { ...small, symbols: register.symbols.filter((entry) => entry.corroboration).slice(0, 1) };
    const lines = (entry: (typeof backed.symbols)[number]) => [entry.passage, entry.corroboration!.passage].filter(Boolean).join(' and ');
    expect((await onlineProblems(backed, async () => wrap(lines(backed.symbols[0]!)))).problems).toEqual([]);
    const missingLine = await onlineProblems(backed, async (url) => wrap(url === backed.symbols[0]!.corroboration!.url ? 'another module' : lines(backed.symbols[0]!)));
    expect(missingLine.problems.join('\n')).toMatch(/the corroborating line is not on https:\/\/raw\.githubusercontent\.com/);
  });
});
