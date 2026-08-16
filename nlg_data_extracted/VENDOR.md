# Vendored: nlg_data

This directory holds vendored third-party research data and code. It is not part of
qupacabras-db proper: nothing in the application build imports from it, and its contents
are not authored or maintained by this project. It was extracted from an `nlg_data.zip`
archive, which has since been removed from the repository root.

## Contents

The directory has been pruned to the paths the verification work depends on:

- `data/` : the measurement records and game definition.
- `src/` : the upstream Python package `nlg_data`.
- `pyproject.toml`, `uv.lock` : the upstream dependency declaration and lock file.

`data/db.json` and `data/experiments/*.json` are the measurement records backing the
published G14 graph-colouring benchmark entries in this database. They are used as test
fixtures for the win-rate verification code.

`src/nlg_data/uncertainty.py` is the reference implementation that the JavaScript
statistics port is checked against. Any change to the JavaScript confidence-interval or
p-value computation is validated against the results this module produces.

## Upstream publication

The `publication` field recorded in `data/db.json` for these experiments reads, exactly:

> citation: `Furches et al. arXiv 2311.01363 (2025)`
>
> url: `https://arxiv.org/abs/2311.01363`

## Licence

The licence of this vendored material is UNRESOLVED. The upstream `pyproject.toml`
declares no licence, and the archive carried no licence file. Settle the licence, and
record the outcome in this file, before the pruned vendor directory is published
publicly. Until then, treat redistribution of this directory as blocked.
