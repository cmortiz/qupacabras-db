/**
 * Chi-square test of independence, with effect sizes, for the non-signaling check.
 *
 * The test asks whether one player's outcome distribution depends on the other player's outcome.
 * On real hardware the p-value alone is not usable as a pass/fail signal: measured on this
 * repository's own published data, the minimum p-value reaches 2e-146 while the maximum
 * total-variation distance is 0.388 against a shot noise floor of about 0.031. The circuits are
 * executed separately, so what the p-value detects is drift and readout asymmetry rather than
 * signaling capacity. `maxTvd` is therefore reported alongside it as the effect size, and it is
 * the quantity a threshold can sensibly be set on.
 *
 * No file is read at module load time.
 */

const { chiSquareSf } = require('./stats');

/**
 * @typedef {Object} ChiSquareResult
 * @property {number} chi2 - Pearson statistic, `sum((obs - exp)^2 / exp)`. Exactly `0` in the
 *   degenerate cases described on `chiSquareIndependence`.
 * @property {number} df - Degrees of freedom, `(rows - 1) * (cols - 1)` after dropping.
 * @property {number} pValue - `chiSquareSf(chi2, df)`, or exactly `1` when `df < 1`.
 * @property {number} minExpected - Smallest expected cell count, the usual validity indicator for
 *   the chi-square approximation. `0` when there is no cell to compute it from.
 * @property {number} rows - Number of retained rows.
 * @property {number} cols - Number of retained columns.
 * @property {number} total - Sum of every count in the input table.
 * @property {number} skipped - Number of all-zero rows plus all-zero columns that were dropped.
 * @property {number} maxTvd - Largest total-variation distance between a row's conditional
 *   distribution and the pooled column distribution, in `[0, 1]`. The effect size.
 * @property {number} maxJsd - Largest Jensen-Shannon divergence, base 2, between the same pair of
 *   distributions, in `[0, 1]`.
 */

/**
 * Rejects anything that is not a rectangular array of arrays of non-negative finite counts.
 *
 * @param {*} table - Candidate table.
 * @returns {void}
 * @throws {TypeError} If the shape or the cell values are wrong.
 */
function assertCountTable(table) {
    if (!Array.isArray(table)) {
        throw new TypeError('table must be an array of arrays');
    }
    const width = table.length > 0 && Array.isArray(table[0]) ? table[0].length : 0;
    for (let i = 0; i < table.length; i += 1) {
        const row = table[i];
        if (!Array.isArray(row)) {
            throw new TypeError('table[' + i + '] must be an array');
        }
        if (row.length !== width) {
            throw new TypeError('table must be rectangular: row ' + i + ' has a different length');
        }
        for (let j = 0; j < row.length; j += 1) {
            const cell = row[j];
            if (typeof cell !== 'number' || !Number.isFinite(cell) || cell < 0) {
                throw new TypeError(
                    'table[' + i + '][' + j + '] must be a non-negative finite number'
                );
            }
        }
    }
}

/**
 * Jensen-Shannon divergence in base 2 between two discrete distributions of equal length.
 *
 * Computed as `H(M) - (H(P) + H(Q)) / 2` with `M = (P + Q) / 2`. Identical distributions give
 * exactly `0`, because `M` reproduces each shared value exactly. The result is clamped into
 * `[0, 1]` to absorb last-bit rounding at the endpoints.
 *
 * @param {number[]} p - First distribution.
 * @param {number[]} q - Second distribution.
 * @returns {number} Divergence in bits, in `[0, 1]`.
 */
function jensenShannonBits(p, q) {
    let acc = 0;
    for (let j = 0; j < p.length; j += 1) {
        const m = 0.5 * (p[j] + q[j]);
        if (m > 0) {
            acc -= m * Math.log2(m);
        }
        if (p[j] > 0) {
            acc += 0.5 * p[j] * Math.log2(p[j]);
        }
        if (q[j] > 0) {
            acc += 0.5 * q[j] * Math.log2(q[j]);
        }
    }
    return Math.min(1, Math.max(0, acc));
}

/**
 * Chi-square test of independence on a contingency table of measurement counts, together with
 * the total-variation and Jensen-Shannon effect sizes.
 *
 * Rows and columns that are entirely zero carry no information and would make the expected
 * counts zero, so they are dropped first and counted in `skipped`. All reported dimensions and
 * degrees of freedom refer to the table after dropping.
 *
 * Degenerate inputs return a well-defined result rather than `NaN` or a throw: when the table is
 * empty, when every count is zero, or when fewer than two rows or columns survive dropping, the
 * result carries `chi2: 0` and `pValue: 1`. The effect sizes and `minExpected` are still computed
 * whenever there is a non-empty table to compute them from, so a single-row table reports its
 * real expected counts and a `maxTvd` of `0`.
 *
 * @param {number[][]} table - Array of rows of non-negative counts. Rows index one player's
 *   outcome, columns the other player's.
 * @returns {ChiSquareResult} The test result.
 * @throws {TypeError} If `table` is not a rectangular array of arrays of non-negative finite
 *   numbers.
 */
function chiSquareIndependence(table) {
    assertCountTable(table);

    const inputRows = table.length;
    const inputCols = inputRows > 0 ? table[0].length : 0;

    const rowTotals = new Array(inputRows).fill(0);
    const colTotals = new Array(inputCols).fill(0);
    let total = 0;

    for (let i = 0; i < inputRows; i += 1) {
        for (let j = 0; j < inputCols; j += 1) {
            const cell = table[i][j];
            rowTotals[i] += cell;
            colTotals[j] += cell;
            total += cell;
        }
    }

    // An all-zero row contributes nothing to any column total and vice versa, so a single pass
    // settles which rows and columns survive.
    const keptRows = [];
    for (let i = 0; i < inputRows; i += 1) {
        if (rowTotals[i] > 0) {
            keptRows.push(i);
        }
    }
    const keptCols = [];
    for (let j = 0; j < inputCols; j += 1) {
        if (colTotals[j] > 0) {
            keptCols.push(j);
        }
    }

    const rows = keptRows.length;
    const cols = keptCols.length;
    const skipped = (inputRows - rows) + (inputCols - cols);

    if (total === 0 || rows < 1 || cols < 1) {
        return {
            chi2: 0,
            df: 0,
            pValue: 1,
            minExpected: 0,
            rows,
            cols,
            total,
            skipped,
            maxTvd: 0,
            maxJsd: 0
        };
    }

    const pooled = new Array(cols);
    for (let j = 0; j < cols; j += 1) {
        pooled[j] = colTotals[keptCols[j]] / total;
    }

    let chi2 = 0;
    let minExpected = Infinity;
    let maxTvd = 0;
    let maxJsd = 0;
    const conditional = new Array(cols);

    for (let i = 0; i < rows; i += 1) {
        const rowIndex = keptRows[i];
        const rowTotal = rowTotals[rowIndex];
        let tvd = 0;

        for (let j = 0; j < cols; j += 1) {
            const colIndex = keptCols[j];
            const observed = table[rowIndex][colIndex];
            const expected = rowTotal * colTotals[colIndex] / total;
            const residual = observed - expected;
            chi2 += residual * residual / expected;
            if (expected < minExpected) {
                minExpected = expected;
            }
            conditional[j] = observed / rowTotal;
            tvd += Math.abs(conditional[j] - pooled[j]);
        }

        tvd *= 0.5;
        if (tvd > maxTvd) {
            maxTvd = tvd;
        }
        const jsd = jensenShannonBits(conditional, pooled);
        if (jsd > maxJsd) {
            maxJsd = jsd;
        }
    }

    const df = (rows - 1) * (cols - 1);
    if (df < 1) {
        return {
            chi2: 0,
            df,
            pValue: 1,
            minExpected,
            rows,
            cols,
            total,
            skipped,
            maxTvd,
            maxJsd
        };
    }

    return {
        chi2,
        df,
        pValue: chiSquareSf(chi2, df),
        minExpected,
        rows,
        cols,
        total,
        skipped,
        maxTvd,
        maxJsd
    };
}

module.exports = {
    chiSquareIndependence
};
