---
Status: accepted
Date: 2026-08-11T07:06:58.116Z
Thread-Id: 01KZQRFXW2YE3JXDBEWQ84CTVQ
---

# 0335. Invoke the gitleaks binary directly rather than the Action wrapper

## Context

The secret-scan gate went red on a commit with no secret in it. Root cause (c8): gitleaks-action ff98106e sets shouldValidate=true at src/index.js:73 and clears it only on the success branch of GET api.github.com/users/<owner>; the .catch only warns and the .finally calls process.exit(1) at 113, before start() at 116. A TLS chain error on that call therefore killed the job with "missing gitleaks license" and the scanner never ran. Upgrading is not a fix: v3.0.0 and master carry byte-identical gate logic at the same line numbers. Frequency is 1 in the last 100 security.yml runs, so doing nothing was a defensible option. The licensing prerequisite was verified before committing to this route: core gitleaks is MIT at v8.30.1 and has never carried a commercial or org-vs-individual restriction (it was GPLv3 until 2018, unlicensed for ~17 months, MIT since 2019-12-04); the proprietary EULA belongs to the Action wrapper alone and scopes itself by its own text to "GITLEAKS-ACTION", which "runs as a GitHub Action".

## Options

- Call the pinned gitleaks binary directly, verifying the published checksum - removes the api.github.com call from the path entirely, so the failure mode becomes unreachable rather than rarer; costs us the wrapper's job-summary and SARIF upload unless re-added by hand
- Set any non-empty GITLEAKS_LICENSE secret - one line, and it works only because upstream's ValidateKey is commented out with the note that their payment method is being declined; it breaks the day they re-enable it, which is a worse failure than the 1-in-100 flake it replaces
- Wrap the step in a retry - cheap, but treats the symptom and still goes red on a correlated outage
- Upgrade the action - REFUTED on evidence, no released version changes the gate logic
- Leave it and document the failure mode - defensible at 1 in 100, and fail-closed is the right direction for a security gate
- continue-on-error - REJECTED outright, it silently disables secret scanning and converts a flaky gate into no gate

## Outcome

Take the direct binary. Quality over speed: the point is to make the failure unreachable, not less frequent. Fail-closed is the correct direction for a security gate, so the defect being fixed is narrower than "it goes red" - it is that the gate fails closed on a call that has nothing to do with secrets, and then reports it as a licensing problem, which sends the reader hunting the wrong thing. Pin the version, verify the published SHA-256 from the release checksums file, and keep the gate red on real findings. Licensing basis is an inference from two individually unambiguous documents (MIT core, Action-scoped EULA) rather than a clause addressing this substitution directly; confidence moderate-high, and this is not legal advice.
