# Verification runbook

Every result in this database used to be an assertion. A submission stored a single number and
nothing recomputed it. A submission that ships its raw per-question measurement counts is different:
the reported number is recalculated from those counts at build time, so the claim becomes a
calculation anyone can repeat.

This document covers how to submit counts, how to run the recomputation, what each check means, how
the build gate behaves, and what to do when the gate goes red.

Entries that carry no counts are not failures. They predate this capability and remain valid
unverified assertions, reported as "nothing to verify".

## Contents

- [Submitting a result with counts](#submitting-a-result-with-counts)
- [Running verification locally](#running-verification-locally)
- [The five checks](#the-five-checks)
- [Policy: report and enforce](#policy-report-and-enforce)
- [Overriding a failure](#overriding-a-failure)
- [The deploy build is red](#the-deploy-build-is-red)
- [Gate layering](#gate-layering)

## Submitting a result with counts

A submission is one folder under `submissions/`. Copy `submissions/template/` and edit it. The
template is a complete, self-consistent, verifying example, and it is checked on every run, so it
cannot silently rot.

```
submissions/<your-folder>/
  benchmark.json     the claim
  counts.json        the raw per-question measurement counts behind it
  README.md          optional notes
```

### The claim

Add a `nonlocalGame` block to `benchmark.json`:

```json
{
  "nonlocalGame": {
    "game": "odd-cycle",
    "params": { "n": 3 },
    "winRate": 0.8059895833333334,
    "shotsPerCircuit": 1024,
    "countsFile": "counts.json",
    "uncertainty": 0.01609972821488432,
    "uncertaintyDefinition": "95% confidence half-width (d = 0.05) over the 6 per-question win rates at 1024 shots each",
    "allowVariableShots": false
  }
}
```

`game`, `winRate`, `shotsPerCircuit` and `countsFile` are required. Run `node -e
"console.log(require('./scripts/lib/nlg/registry').listGames())"` for the games the registry
currently resolves. Adding a game is one file under `scripts/lib/nlg/games/`, one registry line and
one brute-force test; `scripts/lib/nlg/games/README.md` walks through it.

`nonlocalGame.winRate` is the authoritative claim and is held to a tight tolerance. The top-level
`metricValue` is a display value and is held to a tolerance derived from how it was written, so a
rounded `0.94` alongside a full-precision `0.935882...` is accepted.

`countsFile` is a bare filename inside the submission folder. Path separators are rejected by the
schema, so the reference cannot escape the folder.

Do not add a `verification` block. The schema rejects one, and the index generator deletes any
submitted block before assigning the one it computes. Verification status is never read from a
committed flag.

### The counts

```json
{
  "schemaVersion": 1,
  "counts": {
    "0|0": { "0:0": 441, "0:1": 97, "1:0": 95, "1:1": 391 },
    "0|1": { "0:0": 101, "0:1": 417, "1:0": 407, "1:1": 99 }
  }
}
```

Question keys are `"<x>|<y>"`, decimal and unpadded, one per question the game defines. A missing
question key is a structural error.

Answer keys are `"<alice bits>:<bob bits>"`, binary, most significant bit first, with Alice's bit
zero leftmost. The width is fixed by the game and zero padding is mandatory, not cosmetic: without
it `"01"` and `"1"` alias and a submitter can split one outcome across two bins. Missing answer keys
are read as implicit zeros.

Values are non-negative integers. Every question must carry the same total unless
`allowVariableShots` is set, which downgrades the mismatch to a warning and marks the recomputed
confidence interval approximate.

## Running verification locally

```sh
npm install

npm run verify                     # recompute every submission folder
npm run verify -- <folder>         # recompute one, by folder name
npm run verify -- --json <folder>  # the same, machine readable

npm run test:scripts               # the verification core's own test suite
npm run validate                   # schema, QASM and duplicate checks
npm run generate-index             # the exact code path the deploy build gates on
```

`npm run verify` exits 0 when every submission that carries a claim reproduces it. A folder with no
`nonlocalGame` block reports "nothing to verify" and does not affect the exit status.

`npm run test:scripts` runs the statistics, registry, counts, verifier and I/O tests against
committed golden vectors and against the reproduction fixtures. It takes well under a second. Run it
after any change under `scripts/`.

`npm run generate-index` is the check that matters most before pushing, because it is the same code
the deploy build runs.

To render the pull-request comment locally:

```sh
node scripts/ci/verification-report.js <folder>   # writes verification-report.md
```

## The five checks

Each check reports `pass`, `warn`, `fail` or `skip`, under a stable identifier. A `fail` on any
check makes the submission unverified and unranked. A `warn` never does.

### STRUCTURE

The counts document matches the game: declared schema version, the full question key set, fixed
answer key widths, non-negative integer counts, and a constant shot total per question.

A failure means the counts and the declared game disagree about what was measured. The usual causes
are a question key set from a different orientation convention, a different vertex labelling, or
answer keys written without zero padding. Structural errors are aggregated by class, so a document
missing thirty-seven questions produces one error naming the count rather than thirty-seven errors.

Variable shot totals fail here too, under a separate code from a wrong declared value. Set
`allowVariableShots` only when the variation is genuine, and expect the confidence interval to be
marked approximate.

### WIN_RATE

The win rate recomputed from the counts matches `nonlocalGame.winRate`, at an error tolerance of
1e-4 and a warning tolerance of 1e-9. The top-level `metricValue` is checked separately at a
rounding-aware tolerance.

A failure means the stored number is not the number the counts produce. Either the counts are not
the ones the number came from, or the number was computed under a different rule. This is the check
the whole capability exists for; do not route around it.

### UNCERTAINTY

The confidence half-width recomputed from the per-question win rates matches
`nonlocalGame.uncertainty`, at a relative tolerance.

A failure usually means the claimed uncertainty came from a different definition. State the
definition in `uncertaintyDefinition`. The check is skipped when no uncertainty is claimed.

### NON_SIGNALING

Each player's marginal outcome distribution should not depend on the other player's question. A
chi-square test of independence runs over the marginal tables, and both the smallest p-value and the
largest total-variation distance are recorded.

**This check warns; it does not fail.** Measured across the published corpus, twenty-two of the
twenty-four clean fixtures warn at a significance level of 1e-3, with a minimum p-value near 1e-220.
The circuits execute separately, so the statistic measures drift and readout asymmetry between runs,
not signaling capacity, and a threshold on the p-value alone would reject most of the existing
database. An error path exists but requires both a p-value below the significance level and a
total-variation distance above an effect-size threshold, and it ships disabled. Do not enable it
without re-measuring the whole corpus first.

Treat a warning here as information about device stability, not as an accusation.

### SUPERQUANTUM

The observed win rate does not exceed the game's quantum value by more than four standard errors.
Where the quantum value is exactly 1, the check reduces to "not above 1". Where a game pins no
quantum value, it degrades to the same.

A failure means the reported result is above what quantum mechanics allows for that game, so the
counts, the game identification, or the win rule is wrong. Every game in the registry today has a
quantum value of exactly 1 or none at all, so the four-standard-error branch is currently
unreachable and gets its first real exercise when a game registers a quantum value strictly between
0 and 1.

The classical value is reported alongside, with two separate quantities: `classical.sigma`, a
Gaussian-equivalent z-score against the binomial standard error, and `classical.pValue`, a Bernstein
tail bound. They are different things and must not be presented as one.

## Policy: report and enforce

`verification-policy.json` at the repository root holds one key:

```json
{ "mode": "enforce" }
```

`QDB_VERIFY=report` or `QDB_VERIFY=enforce` in the environment overrides the file. An unreadable,
missing or malformed file degrades to `report` with a warning rather than crashing a build, because
a policy file is not a reason to fail a deploy.

**The mode controls exactly one thing: whether a verification failure stops the build.** It never
controls what is recomputed and never controls what the site claims. Under `report`, every
submission is still recomputed, and a submission that fails is still recorded as unverified and
still excluded from any ranked view. A `report` build publishes failures as failures. It does not
publish them as successes and it does not silently drop them.

### Flipping the mode

Edit `verification-policy.json`, commit, push. That is the whole procedure, and it is worth its own
one-word commit so it is visible in the history.

`enforce` is the steady state. Use `report` to land a change safely: run against the corpus,
confirm there are no unexpected failures, then flip. Use `report` again as a rollback when the gate
misfires and the fix will take longer than the outage is worth.

## Overriding a failure

A submission can fail for a reason a maintainer judges acceptable: a known hardware quirk, a legacy
entry, a reconciliation still in progress. An override lets a named person accept a named failure,
on the record, in a committed file.

An override cannot be a pull-request label or a workflow input, because the build that gates the
site is triggered by a push and can see nothing but the committed tree. It must therefore be a
committed file:

`submissions/<folder>/verify-override.json`

```json
{
  "reason": "Counts exported before the shot counter was fixed; the run is genuine and the discrepancy is understood.",
  "approvedBy": "maintainer-handle",
  "approvedAt": "2026-08-22T14:31:00Z",
  "pr": 128,
  "countsSha256": "30d0ed28050f5a9e811c4cc4fcb4ef1ade4c0a27e2c94b9c596bede3c6153a54"
}
```

All five fields are required, and each is checked:

| field | rule |
|---|---|
| `reason` | a non-empty string, free text |
| `approvedBy` | a non-empty string, the approver's GitHub username |
| `approvedAt` | an ISO 8601 timestamp, `2026-08-22T14:31:00Z` |
| `pr` | a positive integer, the pull request number |
| `countsSha256` | 64 lowercase hex characters |

`countsSha256` is the digest of the raw bytes of the submission's counts file, and it is what stops
laundering. An override approves one specific set of counts, not the folder. Edit the counts
afterwards and the digest no longer matches, the override goes stale, and the failure comes back.

Produce the digest with either of these, which agree:

```sh
shasum -a 256 submissions/<folder>/counts.json
node -e "const fs=require('fs');console.log(require('./scripts/lib/nlg/io').sha256Hex(fs.readFileSync('submissions/<folder>/counts.json')))"
```

`submissions/template/verify-override.example.json` is a filled-in example. It is named
`.example.json`, so it is never read as an override. A live one must be named exactly
`verify-override.json`.

### What applying one does

An override changes whether a failure stops the build. It changes nothing else, and in particular
it never makes a number verified.

- `verification.status` becomes `overridden`, never `verified`.
- `verification.ranked` stays `false`, so an overridden entry never appears in a ranked view.
- The failed checks stay recorded as failures in `verification.checks`.
- The suppressed errors reappear as warnings, under their own codes, prefixed with
  `suppressed by verify-override.json`.
- `verification.override` records the reason, the approver, the timestamp, the pull request,
  whether the digest matched, and both digests when it did not.

The site therefore publishes the number as an unverified claim carrying an explicit record of who
accepted it. That is the trade: a maintainer can unblock a deploy, and cannot quietly launder a
result into the verified set.

Under `enforce`, a failure with a valid matching override does not fail the build. Under `report`
nothing fails either way, and the override is still evaluated and still recorded: the policy mode
controls whether the build fails, never what the site claims.

### When an override does not apply

Every case below is a warning, never an error. An override that cannot be used leaves the failure it
was written for exactly where it was.

- **Stale.** `countsSha256` is not the digest of the counts file on disk. Both digests are recorded
  so the discrepancy is readable. This is the case the mechanism exists for.
- **Unreadable counts.** The counts file is missing or unparseable, so there is nothing to check the
  approved digest against.
- **Malformed.** The file is not valid JSON, is not an object, or breaks any rule in the table above.
  The warning names what is wrong with it. A malformed override never suppresses by being
  unparseable and never crashes the build.
- **Unused.** The submission passes verification. The file is dead weight. Delete it.
- **No claim.** The submission carries no `nonlocalGame` block, so nothing was verified and there is
  no failure to accept.

An override is also refused if it is a symbolic link rather than a file in the submission folder, so
a folder cannot borrow an approval written for something else.

### The manual procedure, which is the primary one

Automating the override through a label, a bot or a workflow adds machinery that has to be working
at the moment it is needed. It will be needed at two in the morning during an event. Use the web
editor.

1. Open the submission folder on the repository's web interface.
2. Add a file named `verify-override.json`.
3. Paste the five fields above, with a real reason and the digest from the run that failed.
4. Commit to `main` with a message naming the submission.

Four lines added through a browser always work. Treat any automation as a convenience layered on top
of this, never as a replacement for it.

## The deploy build is red

**The site is frozen, not broken.** This is the designed failure mode and it is worth reading before
doing anything else.

The build chains the index generator and the bundler. Under `enforce` the generator throws before it
writes `public/benchmarks.json`, so the bundler never runs, the build job fails, and the `deploy`
job is skipped through its `needs: build`. The published site keeps serving the last artifact that
passed. Visitors see the previous good data. Nothing is defaced and nothing is lost. What is missing
is the newest submission.

Triage in this order.

1. **Read the build log.** The generator names each failing submission and each reason.

2. **Reproduce it locally.** `npm run verify -- <folder>` gives the same five checks with more
   detail, and `npm run generate-index` gives the identical code path.

3. **Decide what actually failed.** A `WIN_RATE` or `STRUCTURE` failure is a real disagreement
   between a claim and its data. A crash in the verifier itself is a different problem, and shows up
   as a failed check whose message is an exception rather than a comparison.

4. **Fix the submission if the submission is wrong.** A corrected `benchmark.json` or `counts.json`
   pushed to `main` re-runs the build. This is the right answer and usually takes minutes.

5. **Remove the submission if it cannot be fixed now.** Deleting the folder unblocks every other
   submission immediately. Re-add it later.

6. **Write an override if the failure is understood and accepted.** See above. Take the digest from
   the counts file as it stands right now, because that is the only thing the override matches
   against. The entry then publishes as `overridden`, unverified and unranked, naming you.

7. **Flip the policy to `report` if the gate itself is misfiring** and the fix will take longer than
   the freeze is worth. The build then goes green, the site updates, and the affected entries render
   as unverified and unranked rather than as verified. Flip back once the cause is fixed. This is a
   deliberate, visible, reversible decision, not a workaround: record why in the commit message.

What not to do: do not add `continue-on-error`, `|| true` or `if: always()` to the build or deploy
job, and do not move the generator behind the bundler. Any of those turns the gate off permanently
and silently, and the next person will not know it happened.

## Gate layering

Three layers, in decreasing order of trust. Only the first is a gate.

### 1. The deploy build (the gate)

`.github/workflows/deploy.yml`, the build step. Every path by which a number reaches the published
site passes through it, and it regenerates the index before the bundler copies it. It is triggered
by a push to `main`, so it sees the committed tree and nothing else. It cannot be skipped by how a
commit arrived.

### 2. Pull-request checks (advisory)

`.github/workflows/pr-validation.yml` and `.github/workflows/test.yml`. Useful, and advisory only,
for two independent reasons:

- A pull request opened with the default workflow token raises no `pull_request` event, so neither
  workflow starts on a bot-opened pull request. Switching the trigger does not help: the suppression
  keys on the actor, not on the event name. `pr-validation.yml` therefore also triggers on
  `ready_for_review`, so a draft pull request created by automation and marked ready by a human
  re-arms the full suite without anyone needing a personal access token.
- `main` carries no branch protection, so even a live red check does not block a merge. A deploy has
  already succeeded on a commit whose tests were failing.

Treat a green pull-request check as a convenience and a red one as information. Neither is the
decision.

### 3. The pre-commit hook (local)

`.husky/pre-commit`. Validates staged benchmark documents, recomputes staged submission folders,
runs the verification tests when anything under `scripts/` is staged, and regenerates the index. It
takes a second or two and builds nothing. It is skippable with `--no-verify` and runs only on the
machine that has it installed, so it catches mistakes early rather than enforcing anything.

### Branch protection

Enabling branch protection on `main` with required status checks is worth doing and would raise
layer two from advisory toward binding. It is still layer three in the ordering above, not the gate,
because it constrains how a commit arrives rather than what gets published: a workflow that never
starts produces no status to require, and an administrator can merge past it. The build gate holds
in cases branch protection does not.

## Workflow conventions

Two rules apply to every file under `.github/workflows/`.

**No workflow expression goes inside a `run:` or `script:` body.** A `${{ ... }}` expression is
pasted into the body as text before the shell or the script engine parses it, so any value derived
from a submitter, above all a changed file path, becomes executable. Pass values through the step's
`env:` block instead and read them as `"$NAME"` in shell or `process.env.NAME` in JavaScript.
Expressions in `if:`, `with:` and `env:` are evaluated rather than pasted and are fine.

**Logic lives in `scripts/ci/*.js`, not in YAML.** Those files are covered by the eslint run, are
runnable and testable on their own, and cannot break the workflow parser. This repository has broken
its workflow YAML three times inlining scripts into it.

Run `actionlint` before pushing a workflow change. The lint job installs it at a pinned version with
a pinned digest and runs it over every workflow, so a parse error, an undefined expression or an
outdated action reference fails there rather than at the moment a check is needed.
