import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The game's tests get one time limit wherever they run. CI once gave them ninety seconds and a local run five, and
// tests that build rigs, trees and terrain failed as timeouts on a busy machine while CI passed them (the hero's
// quarter turn among them; docs/decisions.md, 15 November 2026).

const config = readFileSync('vite.config.ts', 'utf8');
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');

describe('the game tests’ time limit', () => {
  it('is set once, on the game project, at what CI used to pass on its command line', () => {
    expect(config).toMatch(/export const GAME_TEST_TIMEOUT = 90_000;/);
    const game = /\{ extends: true, test: \{ name: 'game',[^\n]*\} \}/.exec(config)?.[0] ?? '';
    expect(game).toContain('testTimeout: GAME_TEST_TIMEOUT');
  });

  it('is not overridden in CI, so a local run and CI give a test the same time', () => {
    const steps = workflow.split('\n').filter((line) => line.includes('--project game'));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step, step.trim()).not.toMatch(/--testTimeout/);
  });
});
