#!/usr/bin/env node
/**
 * The repository is public. This checks that what a pull request adds to it carries nothing private:
 *
 *   node tools/commit-hygiene.mjs --base <commit> --head <commit> [--title <text>] [--body-file <path>] [--branch <name>]
 *
 * - Every new commit's author and committer use a no-reply address (GitHub's `…@users.noreply.github.com`, or a
 *   `noreply@…` address), and so does every address in a commit message.
 * - No commit message, pull request title or description, branch name or added line holds a link to a working
 *   session, a machine's host name, a network address other than loopback, a path inside someone's home or temporary
 *   folder, or anything shaped like a key or token.
 *
 * In CI the pull request's title, description and branch come from the event file GitHub provides. Exit code 1 lists
 * every finding with where it is and what to change. The rules live in this file; tests/tooling/commitHygiene.test.ts
 * runs each against examples that must and must not be reported.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** An address that reveals no mailbox: GitHub's per-account no-reply address, or the no-reply address of a service. */
export const NO_REPLY = /^(?:(?:\d+\+)?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?@users\.noreply\.github\.com|noreply@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;

const octet = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const quad = new RegExp(`(?<![\\d.])${octet}(?:\\.${octet}){3}(?![\\d.])`, 'g');

/** Each rule: what it finds, how to fix it, and the pattern. Patterns are written so that this file does not match them. */
export const TEXT_RULES = [
  { id: 'session-link', fix: 'remove the link to a working session', find: /https?:\/\/[^\s)>\]"']*\/sessions?[_/-][^\s)>\]"']+|\bsession_[0-9A-Za-z]{8,}\b/gi },
  { id: 'home-path', fix: 'name the file by its path in the repository', find: /(?<![\w.-])\/(?:home|Users)\/[A-Za-z0-9._-]+(?:\/|\b)|(?<![\w.-])\/root\/|\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"']+/g },
  { id: 'temp-path', fix: 'name the file by its path in the repository', find: /(?<![\w.-])\/(?:tmp|var\/folders|private\/var|private\/tmp)\/[A-Za-z0-9._-]+|\b[A-Za-z]:[\\/](?:Windows[\\/])?Temp[\\/]/g },
  { id: 'host-name', fix: 'leave the machine unnamed', find: /\b(?:DESKTOP|LAPTOP|WIN)-[A-Z0-9]{6,}\b|\bip-\d{1,3}(?:-\d{1,3}){3}\b|\b[a-z]+:\/\/[^\s/)>"']*\.(?:local|lan|internal|localdomain|corp|intranet)(?=[:/\s)>"']|$)|\b[A-Za-z0-9._-]+@[A-Za-z0-9][A-Za-z0-9.-]*:[~/]/g },
  // In prose a bare name is enough. In a source file `value.local` is a property, so this one is not applied to files.
  { id: 'host-name', prose: true, fix: 'leave the machine unnamed', find: /(?<![\w./@-])[A-Za-z0-9][A-Za-z0-9-]*\.(?:local|lan|localdomain)\b(?![\w./-])/g },
  { id: 'private-key', fix: 'remove the key and revoke it', find: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { id: 'token', fix: 'remove the token and revoke it', find: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{16,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b/g },
  { id: 'secret-value', fix: 'remove the value; keep secrets out of the repository', find: /\b(?:api[_-]?key|secret|passw(?:or)?d|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["'][A-Za-z0-9/+_=-]{20,}["']/gi },
];

/** Loopback, the unspecified address and the ranges reserved for documentation say nothing about a machine. */
const harmlessAddress = (address) => /^(?:127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(address);

/** Findings in a piece of text: `[{ rule, match, fix }]`. Addresses and e-mail addresses are judged here too. */
export function findInText(text, { addresses = true, mail = true, prose = true } = {}) {
  const found = [];
  for (const rule of TEXT_RULES) if (prose || !rule.prose) for (const match of text.matchAll(rule.find)) found.push({ rule: rule.id, match: match[0].slice(0, 80), fix: rule.fix });
  if (addresses) for (const match of text.matchAll(quad)) if (!harmlessAddress(match[0])) found.push({ rule: 'network-address', match: match[0], fix: 'leave the address out' });
  // `name@host:path` is a remote, not a mailbox; the host-name rule judges it.
  if (mail) for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9-]|\.[A-Za-z0-9-]|:[\w~/])/g)) {
    if (!NO_REPLY.test(match[0])) found.push({ rule: 'mail-address', match: match[0], fix: 'use a no-reply address' });
  }
  return found;
}

/** Findings in one commit: its two identities and its message. */
export function checkCommit(commit) {
  const where = `commit ${commit.sha.slice(0, 9)}`, found = [];
  for (const [role, mailAddress] of [['author', commit.authorMail], ['committer', commit.committerMail]]) {
    if (!NO_REPLY.test(mailAddress)) found.push({ where: `${where}, ${role}`, rule: 'identity', match: mailAddress, fix: `set the ${role} to a GitHub no-reply address (git config user.email "<id>+<login>@users.noreply.github.com")` });
  }
  for (const [role, name] of [['author', commit.authorName], ['committer', commit.committerName]]) for (const hit of findInText(name, { mail: false })) found.push({ where: `${where}, ${role} name`, ...hit });
  for (const hit of findInText(commit.message)) found.push({ where: `${where}, message`, ...hit });
  return found;
}

/** Added lines of a unified diff, with the file each belongs to. Binary files have none. */
export function addedLines(diff) {
  const lines = [];
  let file = null, at = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) { at = Number(hunk[1]); continue; }
    if (line.startsWith('+') && !line.startsWith('+++')) { if (file && file !== '/dev/null') lines.push({ file, line: at, text: line.slice(1) }); at++; }
    else if (!line.startsWith('-') && !line.startsWith('\\')) at++;
  }
  return lines;
}

/**
 * Findings in added lines. A network address or a mail address in a file can be data (a test's sample, a licence), so
 * in files only the rules for links, paths, host names and keys apply; identities are judged on the commits.
 */
export function checkDiff(diff) {
  const found = [];
  for (const { file, line, text } of addedLines(diff)) for (const hit of findInText(text, { addresses: false, mail: false, prose: false })) found.push({ where: `${file}:${line}`, ...hit });
  return found;
}

/** Everything a pull request adds: commits, added lines, and its own title, description and branch name. */
export function checkAll({ commits = [], diff = '', title = '', body = '', branch = '' }) {
  const found = commits.flatMap(checkCommit);
  found.push(...checkDiff(diff));
  for (const [where, text] of [['pull request title', title], ['pull request description', body], ['branch name', branch]]) for (const hit of findInText(text ?? '')) found.push({ where, ...hit });
  return found;
}

const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 });

/** The commits in `head` that are not in `base`, in the repository at `cwd`. */
export function readCommits(base, head, cwd) {
  const SEP = '\x1e', FIELD = '\x1f';
  const out = git(['log', '--no-color', `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%cn${FIELD}%ce${FIELD}%B${SEP}`, `${base}..${head}`], cwd);
  return out.split(SEP).map((entry) => entry.replace(/^\n/, '')).filter(Boolean).map((entry) => {
    const [sha, authorName, authorMail, committerName, committerMail, message] = entry.split(FIELD);
    return { sha, authorName, authorMail, committerName, committerMail, message: message ?? '' };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []));
  const event = process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const pull = event.pull_request ?? {};
  const base = args.base || pull.base?.sha, head = args.head || pull.head?.sha || 'HEAD';
  if (!base) { console.error('commit-hygiene: give --base <commit> (and --head <commit>, HEAD by default).'); process.exit(2); }
  const commits = readCommits(base, head);
  // Three dots: what the branch adds since it left the base, not what the base has gained since.
  const diff = git(['diff', '--no-color', '--no-ext-diff', '--unified=0', `${base}...${head}`]);
  const found = checkAll({
    commits, diff,
    title: args.title ?? pull.title ?? '',
    body: args['body-file'] ? fs.readFileSync(args['body-file'], 'utf8') : pull.body ?? '',
    branch: args.branch ?? pull.head?.ref ?? '',
  });
  if (found.length) {
    console.error(`commit-hygiene: ${found.length} finding${found.length === 1 ? '' : 's'} in ${commits.length} new commit${commits.length === 1 ? '' : 's'}:`);
    for (const hit of found) console.error(`  ${hit.where}: ${hit.rule}: ${JSON.stringify(hit.match)}: ${hit.fix}`);
    process.exit(1);
  }
  console.log(`commit-hygiene: clean. ${commits.length} new commit${commits.length === 1 ? '' : 's'}, ${addedLines(diff).length} added lines, title, description and branch name checked.`);
}
