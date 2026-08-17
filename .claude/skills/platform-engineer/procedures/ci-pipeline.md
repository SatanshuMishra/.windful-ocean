# Continuous-integration and release pipeline authoring

You change pipeline definition files. You never trigger, approve, cancel, or re-run a pipeline, and you never publish an artifact.

## 1. Read the pipeline that exists

Read every workflow or pipeline file in the project before editing one, not only the file you were pointed at. Pipelines couple through triggers, concurrency groups, shared caches, artifact names, and required status checks. A change that looks local to one file often is not.

Match the existing conventions: job naming, the trigger set, the runner image, the node or language version, and how steps are ordered. Deviating from them silently is a defect even when the new form is better in isolation.

## 2. Make the change as static configuration

- Pin every third-party action or image to an immutable reference - a full commit SHA or a content digest - never to a floating tag. A floating tag is an unreviewed change that lands whenever upstream moves.
- Grant the narrowest permissions the job actually needs, and grant them at the job rather than at the workflow when only one job needs them.
- Never inline a secret. Reference the project's secret store, per `procedures/secrets-and-config.md`.
- Keep a job's failure legible: a step that can fail for two different reasons prints which one it was.
- A check that cannot fail is worse than no check. If you add a gate, be able to say what makes it turn red.

## 3. Renaming a required check is a breaking change

The names of a repository's required status checks are configured outside the pipeline file. Renaming a job, or splitting one into a matrix, silently detaches the required check and the branch protection then guards nothing. When your change renames or restructures a job, call that out by name in the hand-back and state the exact settings change the human must make alongside it.

## 4. Check it locally

Run whatever static checker the project already has for these files - a workflow linter, a schema validator, a shell or YAML linter - and read its output. Report the real output, including a partial pass.

If no static checker exists, say so rather than implying the change was checked. Reasoning about a pipeline is not the same as validating it, and a pipeline's real behaviour is only observable once a human runs it.

## 5. What you never do here

- Trigger, re-run, cancel, or approve a pipeline run.
- Authenticate to a runner, a registry, a package index, or a release surface.
- Publish, tag, or promote an artifact.
- Weaken or delete a gate to make a build pass. A failing gate is a finding to hand back, not an obstacle to remove.

## 6. Return

Hand back per `procedures/handback.md`: the files changed, the behavioural change in one line each, the checker output or its absence, any required-check rename called out, and the exact human step to apply and observe the first run.
