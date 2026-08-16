# Benchmark schema

`benchmark-schema.json` is the JSON Schema (draft-07) that every `submissions/<folder>/benchmark.json`
is checked against. It is compiled by `scripts/validate-benchmark.js` and by
`scripts/generate-benchmark-index.js`, so a document that fails it never reaches
`public/benchmarks.json`.

The root is deliberately open. `additionalProperties` is `true`, and published entries carry keys the
schema does not name (`one_qubit_fidelity`, `fidelity_reference`, `acceptedDate`, and others).
Tightening the root would invalidate the existing corpus. Exactly one key is forbidden,
`verification`, for the reason given below.

## Required fields

Four, and no more:

| Field | Type | Constraint |
| --- | --- | --- |
| `algorithmName` | string | 3 to 100 characters |
| `device` | string | 3 to 100 characters |
| `metricName` | string | 3 to 100 characters, free text such as `Win Rate` |
| `metricValue` | number | 0 to 1e6 |

`metricName` is not drawn from a fixed list, and `metricValue` has no metric-specific range. A win
rate and an execution time are both accepted against the same bounds.

## Identity and provenance

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `^[a-zA-Z0-9_-]+$`, 3 to 50 characters. Omit it and the validator fills it from the folder name, with a warning. |
| `contributor` | string or null | GitHub username shape, at most 39 characters |
| `team` | array of string | 1 to 20 names, each 2 to 100 characters |
| `paperUrl` | string or null | must start with `http://` or `https://` |
| `timestamp` | string | ISO 8601 date-time, auto-generated when absent |
| `lastUpdated` | string | ISO 8601 date-time |
| `experimentDate` | string or null | ISO 8601 date-time |
| `description` | string | at most 500 characters |
| `methodology` | string | at most 1000 characters |
| `notes` | string | at most 1000 characters |

## Result and uncertainty

`metricValue` carries the headline number and `uncertainty` (number or null, 0 to 1e6) carries its
error bar. Both are display values. Their relationship to the recomputed win rate is covered under
[Display value against authoritative claim](#display-value-against-authoritative-claim).

## Circuits and graph

| Field | Type | Notes |
| --- | --- | --- |
| `qasmFiles` | array of string | 0 to 50 bare filenames matching `^[^/\\]+\.qasm$`. Declaring them lets the index generator derive qubit and depth ranges from the circuits. |
| `graph` | object | Explicit `edges` as integer index pairs, used as the preferred source for `lambda1` |
| `lambda1` | number or null | Second-smallest normalized-Laplacian eigenvalue, computed by the build |
| `lambda1Source` | string or null | `explicit`, `qasm`, or null |

## Structured metric groups

Three grouped objects, each with `additionalProperties: true` so submitters can extend them:

- `quantumSpecific`: `qubitCount` (integer, at least 1), `gateCount`, `circuitDepth`, `shots`
  (integer, at least 1). Published entries also place `twoQubitGateCount`, `architecture`,
  and `circuitVariations` here.
- `generalMetrics`: platform metrics comparable across problem types, holding `lambda1`,
  `lambda1Source`, `circuitDepth`, `gateFidelity` (`oneQubit`, `twoQubit`, `measurementMethod`,
  `reference`), `readoutFidelity`, `qubitFidelity`, `timing` (`circuitDuration`, `t1`, `t2`,
  `unit`), `runtimeOverT1`, `runtimeOverT2`, `qubitTimeVolume`, `qubitTimeVolumeNormalized`.
- `problemSpecific`: `description`, `primaryMetric` (`name`, `definition`, `value`, `uncertainty`,
  `uncertaintyDefinition`), `qubitRange`, `depthRange`, `shots`, `methodology`, `notes`.

Alongside them sit the flat `timing` object (`circuitDuration`, `t1`, `t2`, `unit`, default `us`),
the computed `qubitTimeVolume` and `qubitTimeVolumeNormalized`, and the free-form `environment`,
`errorRates`, and `executionTime` objects.

## The `nonlocalGame` block

Optional. Present when a submission ships the per-question measurement counts behind its result, so
the reported win rate is recalculated at build time instead of taken on trust. Entries without it
are stored as unverified assertions, which is what all published entries currently are.

Unlike the root, this block sets `additionalProperties: false`. The block is new, nothing in the
corpus uses it, so strictness costs nothing and a mistyped key becomes an error rather than silent
dead data.

Required: `game`, `winRate`, `shotsPerCircuit`, `countsFile`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `game` | string | yes | Registry name, matching `^[a-z0-9][a-z0-9-]{0,63}$`. Resolved by the game registry under `scripts/lib/nlg/`. |
| `params` | object | no | Parameters selecting a member of the game family. Every value must be an integer, for example `{ "n": 3 }` for the odd cycle C_3. |
| `winRate` | number | yes | The authoritative claim, at full precision, 0 to 1. The unweighted mean of the per-question win rates. |
| `shotsPerCircuit` | integer | yes | Shots per question circuit, at least 1, constant across all questions. |
| `countsFile` | string | yes | Bare filename matching `^[^/\\]+\.json$`, resolved inside the submission folder. |
| `uncertainty` | number | no | Uncertainty on `winRate`, at full precision, at least 0. |
| `uncertaintyDefinition` | string | no | How that uncertainty was derived, at most 500 characters. |
| `allowVariableShots` | boolean | no | Default `false`. The documented escape hatch, described below. |
| `eventTeam` | string | no | Event layer, optional and removable. The team name a submission is ranked under. |
| `provenance` | object | no | Event layer, optional and removable. Free-form record of where the counts came from, such as provider job identifiers. |

`params` restricts values to integers on purpose. A submission supplies a name string and integer
parameters, and the registry resolves them. Nothing in a submission is executed as code.

`countsFile` rejects `/` and `\`, so the reference cannot walk out of the submission folder.

### Constant shots, and the escape hatch

`shotsPerCircuit` is a scalar, and the win rate is an unweighted mean over questions. Both hold only
when every question circuit ran the same number of shots, so per-question totals that differ are an
error by default. Setting `allowVariableShots: true` downgrades that error to a warning and marks the
resulting confidence interval approximate. It is documented so a run with dropped shots can still be
published honestly, labelled as what it is.

### Display value against authoritative claim

Two numbers describe the same result, and they are checked differently.

- `nonlocalGame.winRate` is the claim. It is compared against the value recomputed from the counts
  under a tight tolerance.
- top-level `metricValue` is a display value. It is compared under a tolerance derived from its own
  printed form, `String(metricValue)`, so a rounded figure is accepted as rounded.

The split is required by the existing corpus rather than chosen for elegance.
`submissions/g14_graph_coloring_ionq_aria/benchmark.json` records `"metricValue": 0.94` where the
underlying counts give 0.935882. Under a single tight tolerance that entry would fail, and rounding a
headline number to two decimals is normal practice, not misreporting. Placing the full-precision
claim in `nonlocalGame.winRate` keeps the strict check strict without punishing the rounded display.

## `verification` is forbidden

```json
"verification": false
```

A `false` schema matches nothing, so in draft-07 this means the property must never be present. A
submission containing `"verification": {"status": "verified"}` now fails validation:

```text
/verification boolean schema is false
```

The reason is the forgery hole this closes. Verified numbers are recomputed at build time and never
read from a committed flag. The index generator spreads submitted data into `public/benchmarks.json`,
so before this rule a submitter could hand-write a `verification` block and have the site render it
as verified. The block is computed and assigned by the build alone, which is why a submitted one is
never a legitimate field, only an attempt to skip the check.

The rule is one of two layers. The index generator also deletes any submitted `verification` before
assigning the computed block, so a document that bypasses the schema still cannot carry a forged one
through.

## The counts document

`countsFile` points at a JSON document in the same submission folder. It is validated by code rather
than by JSON Schema, because its keys are data (question and answer labels) rather than a fixed field
set. `submissions/template/counts.json` is a complete working example.

```json
{
  "schemaVersion": 1,
  "counts": {
    "0|0": { "0:0": 441, "0:1": 97, "1:0": 95, "1:1": 391 }
  }
}
```

Two top-level keys:

- `schemaVersion`, currently `1`, so the encoding can change later without invalidating what is
  already stored.
- `counts`, a map from question key to a map from answer key to a non-negative integer count.

### Question keys

`"<x>|<y>"`, both decimal and unpadded, for example `"0|13"`. The pair identifies the question sent
to the two players, and the set of pairs is fixed by the game the submission names. A missing
question key is a structural error, since a game with a question absent is not the game that was
registered.

### Answer keys

`"<alice bits>:<bob bits>"`, fixed width, zero-padded, most significant bit first, with `a0`
leftmost. A game giving each player two answer bits, four colours, produces keys such as `"01:10"`.
A game giving each player one bit produces `"0:0"`, `"0:1"`, `"1:0"`, `"1:1"`.

Fixed width is mandatory, not cosmetic. Without padding, `"01"` and `"1"` denote the same answer
while parsing as different keys, and a submitter can split one bin across two labels. The width is
set by the game definition, so it is checked rather than inferred.

### Missing keys

A missing answer key is an implicit zero. Outcomes that never occurred may be omitted. A missing
question key is an error, as above.

## Validating locally

```bash
# every submission folder
npm run validate

# one file
npm run validate:file -- submissions/<folder>/benchmark.json
```

Programmatic use matches what the scripts do:

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('./benchmark-schema.json');

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(benchmarkData)) {
  console.log(validate.errors);
}
```

## Extending the schema

1. Add the property to `benchmark-schema.json`.
2. Leave the root `additionalProperties: true`. Tightening it breaks published entries that carry
   extra keys.
3. Prefer `additionalProperties: false` inside a new nested block, where no stored data can be
   affected.
4. Run `npm run validate` and confirm every existing submission still passes with no new errors.
5. Update this file and `submissions/README.md`, and add the field to `submissions/template/` when a
   submitter is expected to fill it in.
