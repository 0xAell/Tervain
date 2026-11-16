import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { addedLines, checkAll, checkCommit, checkDiff, findInText, NO_REPLY, readCommits, TEXT_RULES } from '../../tools/commit-hygiene.mjs';

// The public repository's check on what a pull request adds (tools/commit-hygiene.mjs). Examples that must be
// reported are put together from parts here, so that this file passes the check it tests.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tool = join(root, 'tools', 'commit-hygiene.mjs');
const j = (...parts: string[]) => parts.join('');
const slash = (...parts: string[]) => parts.join('/');

const SESSION_LINK = j('https://app.example.test/code/', 'session', '_01AbCdEfGh1234');
const HOME = slash('', 'home', 'somebody', 'work');
const MAC_HOME = slash('', 'Users', 'somebody', 'work');
const WINDOWS_HOME = j('C:', '\\Users', '\\Somebody\\Desktop');
const TEMP = slash('', 'tmp', 'work-7', 'out.log');
const MACHINE = j('DESKTOP', '-', 'AB12CD3');
const LAN = j('192', '.168.', '1.20');
const TOKEN = j('gh', 'p_', 'a'.repeat(36));
const MAILBOX = j('someone', '@', 'example.test');
const CLEAN_ID = j('12345+somebody', '@', 'users.noreply.github.com');

const rules = (text: string, options?: Parameters<typeof findInText>[1]) => findInText(text, options).map((hit) => hit.rule);

describe('a no-reply address', () => {
  it('is GitHub’s per-account address or a service’s noreply address, and nothing else', () => {
    for (const address of [CLEAN_ID, j('somebody', '@', 'users.noreply.github.com'), j('noreply', '@', 'github.com'), j('noreply', '@', 'anthropic.com')]) expect(NO_REPLY.test(address), address).toBe(true);
    for (const address of [MAILBOX, j('root', '@', 'buildbox'), j('somebody', '@', 'buildbox.', 'local'), j('me', '@', 'users.noreply.github.com.example.test'), j('no-reply-me', '@', 'example.test'), '']) expect(NO_REPLY.test(address), address).toBe(false);
  });
});

describe('what the rules report in text', () => {
  it('reports a session link, a home or temporary path, a machine name, a network address, a mailbox and a token', () => {
    expect(rules(`see ${SESSION_LINK}`)).toEqual(['session-link']);
    expect(rules(j('resumed ', 'session', '_01AbCdEfGh1234 today'))).toEqual(['session-link']);
    expect(rules(`copied from ${HOME}`)).toEqual(['home-path']);
    expect(rules(`copied from ${MAC_HOME}`)).toEqual(['home-path']);
    expect(rules(`copied from ${WINDOWS_HOME}`)).toEqual(['home-path']);
    expect(rules(`kept under ${slash('', 'root', '.cache')}`)).toEqual(['home-path']);
    expect(rules(`log in ${TEMP}`)).toEqual(['temp-path']);
    expect(rules(`built on ${MACHINE}`)).toEqual(['host-name']);
    expect(rules(j('built on ip', '-10-0-3-7'))).toEqual(['host-name']);
    expect(rules(j('built on buildbox', '.local'))).toEqual(['host-name']);
    expect(rules(j('served from http://nas', '.lan:8080/x'))).toEqual(['host-name']);
    expect(rules(j('somebody', '@', 'buildbox:~/work'))).toContain('host-name');
    expect(rules(`reachable at ${LAN}`)).toEqual(['network-address']);
    expect(rules(`write to ${MAILBOX}`)).toEqual(['mail-address']);
    expect(rules(`token ${TOKEN}`)).toEqual(['token']);
    expect(rules(j('-----BEGIN RSA ', 'PRIVATE KEY-----'))).toEqual(['private-key']);
    expect(rules(j('api_key', ' = "', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5', '"'))).toEqual(['secret-value']);
  });

  it('leaves ordinary project text alone', () => {
    for (const text of [
      'npm run play-gate -- --url http://127.0.0.1:4173/ --against head',
      'Tervain 0.0.48, Chrome 131.0.6778.85, Unreal Engine 5.9',
      'reads .env.local and settings.local.json',
      j('Co-Authored-By: Somebody <', CLEAN_ID, '>'),
      'docs/unreal/web-target.md and tools/play-gate.mjs',
      'git@github.com:owner/repository.git',
      'https://0xaell.github.io/Tervain/ and https://github.com/0xAell/Tervain/pull/790',
      'the session ended; sessions are not kept; a 45 s stall',
      'play-gate: PASS 7c6ef0c305d9',
      'feature/gate-waits-for-deploy',
    ]) expect(findInText(text), text).toEqual([]);
  });

  it('gives every rule a name and what to change, and no rule reports this repository’s own checker or this test', () => {
    for (const rule of TEXT_RULES) { expect(rule.id).toMatch(/^[a-z-]+$/); expect(rule.fix.length).toBeGreaterThan(10); expect(rule.find.flags).toContain('g'); }
    for (const file of [tool, fileURLToPath(import.meta.url), join(root, '.github', 'workflows', 'hygiene.yml')]) {
      const lines = readFileSync(file, 'utf8').split('\n');
      const hits = lines.flatMap((line, index) => findInText(line, { addresses: false, mail: false, prose: false }).map((hit) => `${index + 1}: ${hit.rule}: ${hit.match}`));
      expect(hits, file).toEqual([]);
    }
  });
});

const commit = (over: Record<string, string> = {}) => ({ sha: 'a'.repeat(40), authorName: 'Somebody', authorMail: CLEAN_ID, committerName: 'GitHub', committerMail: j('noreply', '@', 'github.com'), message: 'Fix the gate\n\nWaits for the deploy.\n', ...over });

describe('a commit', () => {
  it('passes with no-reply identities and a plain message', () => {
    expect(checkCommit(commit())).toEqual([]);
    expect(checkCommit(commit({ message: j('Fix\n\nCo-Authored-By: Helper <noreply', '@', 'example.test>\n') }))).toEqual([]);
  });

  it('is reported for an author or committer with a mailbox or a machine’s address', () => {
    expect(checkCommit(commit({ authorMail: MAILBOX })).map((hit) => [hit.where, hit.rule])).toEqual([['commit aaaaaaaaa, author', 'identity']]);
    expect(checkCommit(commit({ committerMail: j('root', '@', 'buildbox') })).map((hit) => [hit.where, hit.rule])).toEqual([['commit aaaaaaaaa, committer', 'identity']]);
    expect(checkCommit(commit({ authorMail: MAILBOX }))[0]!.fix).toContain('users.noreply.github.com');
  });

  it('is reported for a message that carries a session link, a path, an address or someone’s mailbox', () => {
    const message = `Fix\n\nSee ${SESSION_LINK}\nLog: ${TEMP}\nHost ${LAN}\nReviewed-by: A <${MAILBOX}>\n`;
    expect(checkCommit(commit({ message })).map((hit) => hit.rule).sort()).toEqual(['mail-address', 'network-address', 'session-link', 'temp-path']);
    expect(checkCommit(commit({ authorName: j('somebody', '@', 'buildbox:~') })).map((hit) => hit.where)).toEqual(['commit aaaaaaaaa, author name']);
  });
});

describe('added lines', () => {
  const diff = [
    'diff --git a/docs/notes.md b/docs/notes.md', 'index 1111111..2222222 100644', '--- a/docs/notes.md', '+++ b/docs/notes.md',
    '@@ -3,2 +3,3 @@ heading', ' kept line', `-removed ${HOME}`, '+added and fine', `+added ${HOME}/notes`,
    '@@ -20,0 +22,1 @@', `+token ${TOKEN}`,
    'diff --git a/art/picture.png b/art/picture.png', 'Binary files a/art/picture.png and b/art/picture.png differ',
    'diff --git a/old.txt b/old.txt', 'deleted file mode 100644', '--- a/old.txt', '+++ /dev/null', '@@ -1,1 +0,0 @@', `-gone ${TEMP}`,
  ].join('\n');

  it('are read with their file and line; removed lines, binary files and deleted files have none', () => {
    expect(addedLines(diff)).toEqual([
      { file: 'docs/notes.md', line: 4, text: 'added and fine' },
      { file: 'docs/notes.md', line: 5, text: `added ${HOME}/notes` },
      { file: 'docs/notes.md', line: 22, text: `token ${TOKEN}` },
    ]);
  });

  it('are reported where they carry a path or a key, and only added ones', () => {
    expect(checkDiff(diff).map((hit) => [hit.where, hit.rule])).toEqual([['docs/notes.md:5', 'home-path'], ['docs/notes.md:22', 'token']]);
  });

  it('may hold sample addresses and mailboxes, which in a file are data: identities are judged on commits', () => {
    const data = ['+++ b/tests/sample.json', '@@ -0,0 +1,2 @@', `+{"host": "${LAN}", "contact": "${MAILBOX}"}`, '+{"property": "value.local"}'].join('\n');
    expect(checkDiff(data)).toEqual([]);
  });
});

describe('a pull request as a whole', () => {
  it('is clean when its commits, lines, title, description and branch name are', () => {
    expect(checkAll({ commits: [commit()], diff: '', title: 'Fix the gate', body: 'Waits for the deploy.\n\nhttp://127.0.0.1:4173/', branch: 'feature/gate' })).toEqual([]);
  });

  it('is reported for its own title, description or branch name', () => {
    const found = checkAll({ commits: [commit()], title: `Fix (${MACHINE})`, body: `Details: ${SESSION_LINK}`, branch: j('work/', 'session', '_01AbCdEfGh1234') });
    expect(found.map((hit) => [hit.where, hit.rule])).toEqual([['pull request title', 'host-name'], ['pull request description', 'session-link'], ['branch name', 'session-link']]);
  });
});

describe('the command', () => {
  const work = mkdtempSync(join(tmpdir(), 'tervain-hygiene-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const git = (args: string[], env: Record<string, string> = {}) => execFileSync('git', args, { cwd: work, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env } });
  const as = (name: string, mailAddress: string) => ({ GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: mailAddress, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: mailAddress });
  const write = (file: string, content: string) => writeFileSync(join(work, file), content);
  const run = (args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, [tool, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: '', ...env } });

  git(['init', '-q', '-b', 'main']);
  write('a.txt', 'one\n'); git(['add', '.']); git(['commit', '-q', '-m', 'Start'], as('Somebody', MAILBOX));
  const base = git(['rev-parse', 'HEAD']).trim();

  it('passes a branch whose commits are clean, and says what it looked at', () => {
    git(['checkout', '-q', '-b', 'feature/clean']);
    write('a.txt', 'one\ntwo\n'); git(['commit', '-q', '-am', j('Add a line\n\nCo-Authored-By: Helper <noreply', '@', 'example.test>')], as('Somebody', CLEAN_ID));
    const result = run(['--base', base, '--head', 'HEAD', '--title', 'Add a line', '--branch', 'feature/clean']);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('commit-hygiene: clean. 1 new commit, 1 added lines, title, description and branch name checked.\n');
    expect(result.status).toBe(0);
    // The base commit's own mailbox is history, not part of what the branch adds.
    expect(readCommits(base, 'HEAD', work).map((entry) => entry.authorMail)).toEqual([CLEAN_ID]);
  });

  it('fails a branch with a mailbox identity, a session link in a message and a path in an added line, naming each', () => {
    git(['checkout', '-q', '-b', 'feature/leaky', base]);
    write('a.txt', `one\nlog at ${TEMP}\n`);
    git(['commit', '-q', '-am', `Add a log\n\n${SESSION_LINK}`], as('Somebody', MAILBOX));
    const result = run(['--base', base, '--head', 'HEAD']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('commit-hygiene: 4 findings in 1 new commit:');
    for (const part of [', author: identity: ', ', committer: identity: ', ', message: session-link: ', 'a.txt:2: temp-path: ']) expect(result.stderr).toContain(part);
  });

  it('reads the pull request’s commits, title, description and branch from the event file in CI', () => {
    const event = join(work, 'event.json');
    const head = git(['rev-parse', 'feature/clean']).trim();
    writeFileSync(event, JSON.stringify({ pull_request: { title: 'Add a line', body: `Run on ${MACHINE}`, base: { sha: base }, head: { sha: head, ref: 'feature/clean' } } }));
    const result = run([], { GITHUB_EVENT_PATH: event });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('pull request description: host-name: ');
    writeFileSync(event, JSON.stringify({ pull_request: { title: 'Add a line', body: null, base: { sha: base }, head: { sha: head, ref: 'feature/clean' } } }));
    expect(run([], { GITHUB_EVENT_PATH: event }).status).toBe(0);
  });

  it('asks for a base when it has none', () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('give --base');
  });
});
