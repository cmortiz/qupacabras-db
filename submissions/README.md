# Submissions

One folder per benchmark entry. Every folder here is read by `scripts/generate-benchmark-index.js`,
which validates it and writes `public/benchmarks.json`, the file the site renders. A folder that
fails validation does not reach the site.

The folder named `template` is the exception. Both `scripts/validate-benchmark.js` and
`scripts/generate-benchmark-index.js` skip it by name, so it is a working example rather than a
published entry. Start from `submissions/template/`.

## What a folder contains

| File | Required | Purpose |
| --- | --- | --- |
| `benchmark.json` | yes | The entry itself, validated against `schemas/benchmark-schema.json` |
| `counts.json` | no | Per-question measurement counts, so the reported win rate is recomputed rather than trusted |
| `*.qasm` | no | Circuits for the run |
| `README.md` | no | Longer description, methodology, links |

`benchmark.json` is the only required file. A folder without one is reported and skipped.

The counts file may carry any bare `.json` name, and `nonlocalGame.countsFile` names it. `counts.json`
is the convention. QASM files are picked up only when `benchmark.json` lists them under `qasmFiles`,
which is what lets the index generator derive qubit and depth ranges from the circuits. A `.qasm`
file sitting in the folder undeclared is stored but not analyzed, which is the current state of every
published folder that has one.

## Folder naming

Lowercase, underscore separated, `<experiment>_<device>`:

```text
g14_graph_coloring_duke_gold
g14_graph_coloring_ibm_quito
g14_graph_coloring_rigetti_ankaa3
```

The folder name is also the entry `id`. Setting `id` inside `benchmark.json` to something else raises
a warning, and omitting `id` entirely fills it from the folder name, also with a warning. Omitting it
is the simpler choice, since renaming the folder then keeps the two in step.

## Adding a submission

1. Copy `submissions/template/` to a new folder following the naming convention above.
2. Replace every value in `benchmark.json` with the real run. The four required fields are
   `algorithmName`, `device`, `metricName`, and `metricValue`.
3. For a nonlocal game result, replace `counts.json` with the real per-question counts and set the
   `nonlocalGame` block to match. Both files go in the same folder, in the same pull request.
4. Validate locally, see below.
5. Open a pull request.

`CONTRIBUTING.md` describes a browser route through the issue form for entries that carry no counts
file.

## Recomputed results

A submission that includes a `nonlocalGame` block and a counts file states a win rate that the build
recalculates from the raw counts. The claim then stands or falls on the arithmetic rather than on the
submitter's word.

Two fields hold the same result for different purposes. `nonlocalGame.winRate` is the authoritative
full-precision claim and is checked tightly against the recomputed value. Top-level `metricValue` is
the display number and is checked against a tolerance derived from how it is written, so `0.94` is
accepted as a rounded form. `schemas/README.md` documents the block field by field, along with the
counts encoding.

One key may never appear in a submission: `verification`. The build computes it and assigns it
itself, so a submitted one is an attempt to publish an unchecked result as checked. The schema
rejects it, and the index generator deletes any that arrives.

## Validating locally

```bash
# every submission folder, plus duplicate detection
npm run validate

# one file
npm run validate:file -- submissions/<folder>/benchmark.json

# regenerate the published index, which validates as it goes
npm run generate-index
```

`npm run validate` prints one block per folder and ends with a summary:

```text
📊 Summary:
   Total submissions: 18
   Valid: 18
   Invalid: 0
   Duplicates: 0
```

`.husky/pre-commit` runs the single-file validation on each staged `submissions/*/benchmark.json` and
then the full index generation, so most mistakes surface at commit time.
