/** Current audio preparation entry point. The historical 0.1.0 tool and its generation records are preserved in that revision. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const render = fileURLToPath(new URL('./render-ford.py', import.meta.url));
const job = spawnSync(process.env.PYTHON || 'python3', [render], { stdio: 'inherit' });
if (job.error) throw job.error;
process.exitCode = job.status ?? 1;
