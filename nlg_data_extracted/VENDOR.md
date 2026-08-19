# Vendored: nlg_data

This directory holds vendored third-party research data. It is not part of qupacabras-db
proper: nothing in the application build imports from it, and its contents are not
authored or maintained by this project. It was extracted from an `nlg_data.zip` archive,
which has since been removed from the repository root.

## Contents

The directory has been pruned to the paths the verification work depends on:

- `data/` : the measurement records and game definition.
- `data/LICENSE` : the licence covering `data/`, and nothing else.

`data/db.json` and `data/experiments/*.json` are the measurement records backing the
published G14 graph-colouring benchmark entries in this database. They are used as test
fixtures for the win-rate verification code, in
`scripts/lib/nlg/__tests__/stats.test.js` and `scripts/lib/nlg/__tests__/verify.test.js`.
`data/games/g14/g14.nx` is the G14 graph itself, transcribed independently in
`scripts/lib/nlg/__tests__/games.test.js`.

## What was removed, and why

The upstream Python package (`src/nlg_data/`), its `pyproject.toml` and its `uv.lock`
were deleted rather than licensed. Nothing read them: `src/nlg_data/uncertainty.py` was
the reference implementation that the JavaScript port in `scripts/lib/nlg/stats.js` was
checked against, and it appeared in this repository only in a comment and a doc string.
Both now name the paper instead of the path. The port's bit-for-bit agreement with the
reference is what the committed reference values in `scripts/lib/nlg/__tests__/stats.test.js`
record, and those values do not need the Python source to stay in the tree.

Redistributing code carries obligations that redistributing the data does not, and the
code bought this project nothing, so the cheapest way to settle its licence was to stop
carrying it.

## Upstream publication

The `publication` field recorded in `data/db.json` for these experiments reads, exactly:

> citation: `Furches et al. arXiv 2311.01363 (2025)`
>
> url: `https://arxiv.org/abs/2311.01363`

That preprint was published as Furches, Chehade, Hamilton, Wiebe and Ortiz Marrero,
*Application-level benchmarking of quantum computers using nonlocal game strategies*,
Quantum Science and Technology **10**(4), 045002 (2025), doi `10.1088/2058-9565/adf1c0`.
`CITATION.cff` at the repository root carries both records machine-readably.

## Licence

`data/` is published under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
The full text is in `data/LICENSE`, together with the attribution the licence requires.
This covers `data/` only. The rest of the repository is MIT, under the root `LICENSE`.

Repository code stays MIT. The two licences do not meet: nothing under `data/` is code,
and nothing outside it is this data.

### Still outstanding

The designation above is recorded here so that redistribution is no longer blocked on an
unanswered question. It is not a substitute for the two confirmations still owed, and
neither of them has been obtained:

1. **Co-author sign-off.** The measurement records belong to a five-author paper. Written
   agreement from the co-authors that CC BY 4.0 is the licence they want on this data has
   not been collected.
2. **Institutional clearance.** The runs were executed on hardware accessed through
   institutional agreements, and the institutions behind that access have not confirmed
   that redistributing the resulting measurement records under an open licence is within
   the terms they were obtained under.

Until both are settled, treat the CC BY 4.0 designation as this repository's declared
intent rather than as a cleared release. If either confirmation comes back differently,
the licence recorded here and in `data/LICENSE` changes, and this section records the
outcome.
