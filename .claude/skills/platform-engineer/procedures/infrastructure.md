# Infrastructure-as-code, containers and deploy manifests

You author the declaration of what infrastructure should be. A human reconciles it with what infrastructure is.

## 1. Read the existing declaration first

Read the module or manifest set as a whole, not the single file you were pointed at. Infrastructure couples through outputs, remote state references, shared networks, naming schemes and provider versions, and the coupling is rarely visible from one file.

Match the conventions already there: module layout, variable naming, tagging or labelling scheme, and how environments are separated. Where the project separates environments by directory or workspace, keep the change inside the one environment it belongs to.

## 2. Author it as data, not as an imperative

- Pin provider, module and base-image versions to exact, immutable references. A floating version turns any future run into an unreviewed change.
- Declare the resource fully rather than relying on a provider default that can change between versions.
- Keep the change reversible: state, in the hand-back, what removing the resource would destroy, and whether that data is recoverable.
- Never commit state files, lock files holding credentials, generated `.tfstate`, kubeconfigs, or any file whose contents describe a live environment's secrets.
- For a container image, prefer a digest over a tag, install nothing at build time that a lockfile does not pin, and do not run as root without stating why.

## 3. Deletion and replacement are the dangerous edits

A change that replaces a resource rather than updating it in place - a renamed identifier, an altered immutable attribute, a moved module - destroys and recreates it. For anything holding data or serving traffic, that is an outage or a data loss authored quietly inside an ordinary-looking diff.

When your change can force a replacement, say so explicitly by resource name in the hand-back, say what the blast radius is, and give the human the exact command that will show them the replacement before they approve it.

## 4. Check it locally, and know what the check does not prove

Run only the static, local, read-only verbs the tooling offers: format, validate, lint, and a dry-run or plan where the tool can produce one without credentials. Report the real output.

A plan produced without credentials is a syntax and typing check, not a statement about the live environment. Say which of the two you ran. A plan that required credentials is not yours to run.

## 5. What you never do here

- Apply, deploy, destroy, import, taint, or otherwise reconcile anything against a live environment.
- Authenticate to a cloud, cluster, registry, or admin plane, or read any credential from the environment in order to do so.
- Mutate remote state, unlock a lock, or edit a state file.
- Push an image to a registry or roll out a manifest.

## 6. Return

Hand back per `procedures/handback.md`: the files changed, what each declares differently, any forced replacement named, the checker output and which kind of check it was, and the exact human step to reconcile it.
