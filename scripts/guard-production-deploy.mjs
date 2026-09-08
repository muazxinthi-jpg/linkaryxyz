import { execFileSync } from 'node:child_process';

function gitBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const workersBranch = (process.env.WORKERS_CI_BRANCH || '').trim();
const githubBranch = (process.env.GITHUB_REF_NAME || '').trim();
const localBranch = gitBranch();
const branch = workersBranch || githubBranch || localBranch;
const isCi = process.env.WORKERS_CI === '1' || process.env.CI === 'true' || Boolean(process.env.GITHUB_ACTIONS);

if (!branch && isCi) {
  console.error('Refusing production deployment: CI branch provenance is unavailable.');
  process.exit(1);
}

if (branch && branch !== 'main') {
  console.error(`Refusing production deployment from non-main branch: ${branch}`);
  console.error('Use npm run deploy:preview, npm run deploy:dry, or merge through the protected main workflow.');
  process.exit(1);
}

console.log(`Production deploy provenance accepted${branch ? ` for branch ${branch}` : ''}.`);
