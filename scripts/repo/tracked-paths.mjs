import { spawnSync } from 'node:child_process';

export function listTrackedPaths(cwd) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const cause = result.error ? result.error.message : (result.stderr ?? '').trim();
    throw new Error(`git ls-files in ${cwd} exited ${result.status}, so the census cannot trust its listing: ${cause}`);
  }
  const paths = result.stdout.split('\0').filter((path) => path !== '');
  if (paths.length === 0) {
    throw new Error(`git ls-files listed no path in ${cwd}, so the census has nothing to check`);
  }
  return paths;
}
