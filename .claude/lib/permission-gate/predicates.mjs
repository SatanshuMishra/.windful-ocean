import * as P from './patterns.mjs';
import { isInside } from './workspace.mjs';

const pass = Object.freeze({ block: false, reason: '' });

const stop = (reason) => Object.freeze({ block: true, reason });

export function isRelevant(ctx) {
  if (ctx.empty) return false;
  if (ctx.targetPath !== '') return true;
  return P.mentionsAnyTrigger(ctx.text);
}

function carriesCredential(text) {
  return P.CREDENTIAL_FILE.test(text)
    || P.CREDENTIAL_LITERAL.test(text)
    || P.CREDENTIAL_REFERENCE.test(text);
}

function reachesNetwork(text) {
  return P.EGRESS_BINARY.test(text) || P.EGRESS_REACH.test(text);
}

export function movesCredentialsOffMachine(ctx) {
  if (ctx.targetPath !== '' && P.CREDENTIAL_PATH_TARGET.test(ctx.targetPath)) {
    return stop(`reading credential-shaped file ${ctx.targetPath} is guarded: disclosure is the one effect no checkpoint, snapshot or reflog can undo`);
  }
  if (ctx.command === '') return pass;
  if (reachesNetwork(ctx.command) && carriesCredential(ctx.command)) {
    return stop('this command moves credential-shaped data off the machine; rotation prevents future misuse but cannot undo a disclosure, so the egress is guarded while ordinary network calls are not');
  }
  for (const segment of ctx.segments) {
    if (P.READER_BINARY.test(segment) && P.SECRET_MATERIAL.test(segment)) {
      return stop('this command reads credential material; the read is the first half of a disclosure that no local recovery layer can reverse');
    }
  }
  return pass;
}

export function spendsUnboundedResources(ctx) {
  if (ctx.command === '') return pass;
  if (P.FORK_BOMB.test(ctx.command)) {
    return stop('this command is a fork bomb; it exhausts the process table and takes the recovery layer down with the machine');
  }
  if (P.matchesAny(P.UNBOUNDED_FILL, ctx.command)) {
    return stop('this command writes without bound; a full volume silently thins the APFS snapshots that layer 1 depends on');
  }
  return pass;
}

export function disablesRecoveryOrGate(ctx) {
  if (ctx.command === '') return pass;
  const text = ctx.command;
  if (P.matchesAny(P.REFLOG_PRUNE, text)) {
    return stop('this command prunes the reflog or the object store, which converts every adjacent mistake, past and future, from recoverable into permanent');
  }
  if (P.CHECKPOINT_NAMESPACE.test(text) && P.CHECKPOINT_DELETE.test(text)) {
    return stop('this command deletes reversibility checkpoint refs; those refs are the recovery copy every destructive local operation is allowed against');
  }
  if (P.SNAPSHOT_DISABLE.test(text)) {
    return stop('this command deletes or disables local snapshots, which is the whole-volume backstop under the checkpoint layer');
  }
  if (P.TRASH_EMPTY.test(text)) {
    return stop('this command empties the Trash, which is the recovery copy behind every rewritten rm');
  }
  if (P.REVERSIBILITY_JOB.test(text)) {
    return stop('this command stops the reversibility jobs; a control the agent can disarm is not a control');
  }
  if (P.matchesAny(P.DEVICE_DESTRUCTION, text)) {
    return stop('this command writes to or reformats a raw device, destroying the volume that holds the snapshots, the object store and the checkpoints');
  }
  if (P.SUDO_REMOVE.test(text)) {
    return stop('privileged removal escapes the sandbox and can delete the gate, the hooks and the recovery layer itself');
  }
  if (P.GUARD_PATH.test(text) && P.GUARD_UNLOCK.test(text)) {
    return stop('this command removes immutable-flag protection from a guardrail file');
  }
  if (P.GUARD_PATH.test(text) && P.GUARD_WRITE_VERB.test(text)) {
    return stop('this command writes to the gate or its configuration through the shell; edit it with the Edit tool so the protected-path path still applies');
  }
  return pass;
}

export function resolvesOutsideWorkspace(ctx, workspace) {
  if (ctx.command !== '' && P.SYSTEM_ROOT_TARGET.test(ctx.command)) {
    return stop('this command removes a filesystem root or a top-level system directory; no checkpoint covers a target outside every worktree');
  }
  const engages = ctx.targetPath !== '' || P.matchesAny(P.DESTRUCTIVE_LOCAL, ctx.command);
  if (!engages) return pass;
  const roots = workspace.roots(ctx.cwd);
  return Object.freeze({
    block: false,
    reason: '',
    inWorkspace: roots.length > 0 && (ctx.targetPath === '' ? true : isInside(ctx.targetPath, roots)),
  });
}

function pushTargets(command) {
  const afterPush = command.split(/\bpush\b/i).slice(1).join(' ');
  const words = afterPush.split(/\s+/).filter((word) => word !== '' && !word.startsWith('-'));
  return words.slice(1).map((word) => (word.includes(':') ? word.slice(word.lastIndexOf(':') + 1) : word));
}

function guardsForcePush(ctx, workspace) {
  if (!P.GIT_PUSH.test(ctx.command)) return pass;
  if (P.FORCE_WITH_LEASE.test(ctx.command)) return pass;
  if (!P.FORCE_FLAG.test(ctx.command)) return pass;
  const explicit = pushTargets(ctx.command);
  const targets = explicit.length > 0 ? explicit : [workspace.currentBranch(ctx.cwd)];
  const shared = targets.filter((target) => target !== '' && P.SHARED_BRANCH.test(target));
  if (shared.length === 0) return pass;
  return stop(`force-pushing ${shared.join(', ')} discards history another party consumes, and no vendor documents a server-side retention window for the objects it orphans`);
}

function guardsPullRequestProcess(ctx) {
  const text = ctx.command;
  if (!P.GH_CALL.test(text)) return pass;
  const api = P.GH_API.test(text);
  const graphql = api && P.GRAPHQL.test(text);
  if (P.GH_PR_MERGE.test(text)
    || (api && P.PULLS_MERGE.test(text))
    || (graphql && P.GRAPHQL_MERGE_MUTATION.test(text))) {
    return stop('merging a pull request is human-gated; a human merges through the pull request after review');
  }
  if (P.GH_PR_CREATE.test(text)
    || (P.GH_PR_EDIT.test(text) && P.GH_PR_EDIT_TITLE_OR_BODY.test(text))
    || (api && P.PULLS_ENDPOINT.test(text) && P.METHOD_POST.test(text))
    || (api && P.PULLS_NUMBERED.test(text) && P.METHOD_PATCH.test(text))
    || (graphql && P.GRAPHQL_PR_MUTATION.test(text))
    || (graphql && P.GRAPHQL_OPAQUE.test(text))) {
    return stop('opening or rewriting a pull request is centralized: run node .claude/lib/git/pr.mjs pr-create, passing every value as one inert argv value');
  }
  return pass;
}

function guardsRemoteDatabase(ctx) {
  const text = ctx.command;
  if (P.SUPABASE_BINARY.test(text)) {
    if (P.matchesAny(P.SUPABASE_REMOTE_VERB, text) || P.SUPABASE_REMOTE_FLAG.test(text)) {
      return stop('this command reaches a hosted database project; author the SQL and let a human apply it. Local disposable containers are unaffected');
    }
  }
  if (P.DB_CLIENT.test(text)) {
    const url = P.DB_URL.exec(text);
    const flag = P.DB_HOST_FLAG.exec(text);
    const host = (url && url[1]) || (flag && flag[1]) || '';
    if (host !== '' && !P.LOCAL_HOST.test(host)) {
      return stop(`this command connects a database client to ${host}, which is off this machine and beyond every local recovery layer`);
    }
  }
  return pass;
}

export function reachesRemoteOrPublishedState(ctx, workspace) {
  if (ctx.command === '') return pass;
  const process = guardsPullRequestProcess(ctx);
  if (process.block) return process;
  const database = guardsRemoteDatabase(ctx);
  if (database.block) return database;
  if (P.matchesAny(P.DEPLOY_VERB, ctx.command)) {
    return stop('this command changes remote or production infrastructure, which no local snapshot or checkpoint reaches');
  }
  if (P.matchesAny(P.EMAIL_SEND, ctx.command)) {
    return stop('sending mail reaches a party outside the account and has no retraction mechanism');
  }
  if (P.matchesAny(P.PACKAGE_PUBLISH, ctx.command)) {
    return stop('publishing a package reaches consumers outside the account and cannot be retracted once mirrored');
  }
  if (P.matchesAny(P.PAYMENT_CALL, ctx.command)) {
    return stop('this command performs a real-world payment action against a third party');
  }
  if (P.matchesAny(P.MAKE_PUBLIC, ctx.command)) {
    return stop('this command makes private state public; the exposure cannot be undone once the data is copied');
  }
  return guardsForcePush(ctx, workspace);
}

export function lacksIntactRecoveryCopy(ctx, workspace, workspaceState) {
  if (ctx.command === '' || !P.matchesAny(P.DESTRUCTIVE_LOCAL, ctx.command)) return pass;
  if (workspaceState.inWorkspace === false) return pass;
  if (workspace.isClean(ctx.cwd)) return pass;
  const refs = workspace.checkpointRefs(ctx.cwd);
  if (refs.length > 0) return pass;
  return stop('this destroys uncommitted work while no reversibility checkpoint exists for this worktree; the checkpoint hook is failing, so restore it before running this');
}
