# Submission template

A working example of a submission whose result is recomputed rather than trusted. Copy this folder,
rename it, and replace the values.

Both `scripts/validate-benchmark.js` and `scripts/generate-benchmark-index.js` skip a folder named
`template`, so nothing here is published. The two files are consistent with each other: the win rate
claimed in `benchmark.json` is the win rate the counts in `counts.json` actually produce.

## The example

The odd cycle game C_3. Two separated players receive a question pair and answer one bit each. Six
questions, `(0,0) (1,1) (2,2) (0,1) (1,2) (2,0)`, at 1024 shots apiece, 6144 shots in total. A round
is won when the two questions are equal and the two answers agree, or when the two questions are
adjacent and the answers differ.

The counts give per-question win rates of 0.8125, 0.796875, 0.8203125, 0.8046875, 0.7890625, and
0.8125. Their unweighted mean is 0.8059895833333334, below the classical value of C_3, which is
`1 - 1/(2n) = 5/6 = 0.8333333333333334`. The example therefore claims no quantum advantage, which is
the honest default for a template.

## `benchmark.json`

Replace the descriptive fields (`algorithmName`, `device`, `description`, `team`, `contributor`,
`timestamp`, `experimentDate`, `notes`) and the `quantumSpecific` block with the real run. Then set
the two blocks that carry the result:

- `metricValue` and `uncertainty` are the display numbers. Rounding is expected, and they are checked
  against a tolerance derived from how they are written.
- `nonlocalGame` is the claim that gets checked. Set `game` to the registry name and `params` to its
  integer parameters, `shotsPerCircuit` to the constant shot count per question circuit, `countsFile`
  to the counts filename in this folder, and `winRate` to the full-precision win rate the counts
  produce.

Do not add a `verification` key. The build computes that block and assigns it, and the schema rejects
any submitted one.

Leave `id` out. The validator fills it from the folder name, so renaming the folder keeps the two in
step.

## `counts.json`

The raw per-question measurement counts.

```json
{
  "schemaVersion": 1,
  "counts": {
    "0|0": { "0:0": 441, "0:1": 97, "1:0": 95, "1:1": 391 }
  }
}
```

Question keys are `"<x>|<y>"`, decimal and unpadded. Answer keys are
`"<alice bits>:<bob bits>"`, fixed width, zero-padded, most significant bit first, with `a0`
leftmost. This game gives each player one answer bit, so the four keys are `"0:0"`, `"0:1"`, `"1:0"`,
and `"1:1"`. A game with four colours gives each player two bits and keys such as `"01:10"`.

The zero padding is mandatory. Without it `"01"` and `"1"` name the same answer under two different
labels, and one bin can be split across both.

Every question the game defines must be present. An answer key that never occurred may be omitted and
counts as zero.

`schemaVersion` stays `1` until the encoding changes.

## Check before opening a pull request

```bash
# schema check on the copied folder
npm run validate:file -- submissions/<your-folder>/benchmark.json

# every folder, plus duplicate detection
npm run validate

# regenerate the published index
npm run generate-index
```

`schemas/README.md` documents the `nonlocalGame` block and the counts encoding field by field.
`../README.md` covers folder naming and what else a submission folder may contain.
