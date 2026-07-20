export function resetPreamble(worktree, ref) {
  if (typeof worktree !== 'string' || !/^\/[A-Za-z0-9._\/-]+$/.test(worktree)) {
    throw new Error(`retry: refusing unsafe worktree path in reset preamble: ${JSON.stringify(worktree)}`);
  }
  if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(ref)) {
    throw new Error(`retry: refusing unsafe ref in reset preamble: ${JSON.stringify(ref)}`);
  }
  return `git -C ${worktree} reset --hard ${ref}\ngit -C ${worktree} clean -fdx\n`;
}
