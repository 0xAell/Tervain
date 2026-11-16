import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every CI job has a time limit. Without one a hung job holds its run for GitHub's six-hour default: on 16 November
// 2026 a Gothic 3 study shard's checkout hung for 23 minutes until a later push cancelled the run. A limit is several
// times the job's usual length, so a slow runner still passes and a hung one fails in minutes.

const folder = '.github/workflows';
const workflows = readdirSync(folder).filter((file) => file.endsWith('.yml')).sort();

/** Each job of a workflow, by name, with the lines of its block. */
const jobsOf = (text: string) => {
  const body = text.split(/\njobs:\n/)[1] ?? '';
  return [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):\n((?:(?: {4}.*)?\n)*)/gm)].map(([, name = '', block = '']) => ({ name, block }));
};

describe('the CI jobs’ time limits', () => {
  it('reads every workflow and finds its jobs', () => {
    expect(workflows).toEqual(['hygiene.yml', 'pages.yml', 'play-gate.yml', 'release.yml', 'unreal-seed.yml']);
    for (const file of workflows) expect(jobsOf(readFileSync(`${folder}/${file}`, 'utf8')).length, file).toBeGreaterThan(0);
  });

  it.each(workflows)('%s gives every job a limit of at most an hour', (file) => {
    for (const { name, block } of jobsOf(readFileSync(`${folder}/${file}`, 'utf8'))) {
      const minutes = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(block)?.[1]);
      expect(minutes, `${file}: ${name}`).toBeGreaterThan(0);
      expect(minutes, `${file}: ${name}`).toBeLessThanOrEqual(60);
    }
  });
});
