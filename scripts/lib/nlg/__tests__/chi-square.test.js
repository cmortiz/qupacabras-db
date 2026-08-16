/**
 * Tests for `scripts/lib/nlg/chi-square.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/`. These use `node:test`, not Jest, and live
 * under `scripts/` where the CRA Jest runner does not look.
 *
 * The expected statistics, p-values and effect sizes below were cross-checked against
 * `scipy.stats.chi2_contingency(table, correction=False)` on SciPy 1.13.1 during authoring. The
 * 2x2 case is additionally worked out by hand in the comment on its test so the fixture is not
 * the only witness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { chiSquareIndependence } = require('../chi-square');

/**
 * Asserts a relative match, falling back to an absolute comparison at zero.
 *
 * @param {number} got - Observed value.
 * @param {number} want - Expected value.
 * @param {number} rtol - Relative tolerance.
 * @param {string} label - Name used in the failure message.
 * @returns {void}
 */
function assertClose(got, want, rtol, label) {
    const diff = Math.abs(got - want);
    const scale = Math.abs(want);
    const ok = scale === 0 ? diff === 0 : diff / scale <= rtol;
    assert.ok(ok, label + ': got ' + got + ', want ' + want + ', diff ' + diff);
}

test('hand-computed 2x2 table', () => {
    // table = [[10, 20],
    //          [30, 40]]
    // total = 100, row totals 30 and 70, column totals 40 and 60.
    //
    // expected = [[30*40/100, 30*60/100],   = [[12, 18],
    //             [70*40/100, 70*60/100]]      [28, 42]]
    // every residual is +/- 2, so
    // chi2 = 4/12 + 4/18 + 4/28 + 4/42
    //      = 4 * (21 + 14 + 9 + 6) / 252
    //      = 4 * 50 / 252 = 200/252 = 50/63.
    // df = (2 - 1) * (2 - 1) = 1. minExpected = 12.
    //
    // pooled column distribution = (0.4, 0.6).
    // row 0 conditional = (10/30, 20/30) = (1/3, 2/3),
    //   tvd = 0.5 * (|1/3 - 2/5| + |2/3 - 3/5|) = 0.5 * (1/15 + 1/15) = 1/15.
    // row 1 conditional = (30/70, 40/70) = (3/7, 4/7),
    //   tvd = 0.5 * (|3/7 - 2/5| + |4/7 - 3/5|) = 0.5 * (1/35 + 1/35) = 1/35.
    // maxTvd = 1/15.
    const result = chiSquareIndependence([[10, 20], [30, 40]]);

    assert.equal(result.chi2, 50 / 63);
    assert.equal(result.df, 1);
    assert.equal(result.minExpected, 12);
    assert.equal(result.rows, 2);
    assert.equal(result.cols, 2);
    assert.equal(result.total, 100);
    assert.equal(result.skipped, 0);
    assertClose(result.maxTvd, 1 / 15, 1e-14, 'maxTvd');
    // SciPy: chi2.sf(50/63, 1) = 0.37299848361348686.
    assertClose(result.pValue, 0.37299848361348686, 1e-12, 'pValue');
    assertClose(result.maxJsd, 0.0034550293393263987, 1e-12, 'maxJsd');
});

test('a second 2x2 table with a mid-range p-value', () => {
    // [[30, 20], [20, 30]]: every expected count is 25, every residual is +/- 5,
    // so chi2 = 4 * 25 / 25 = 4 on 1 degree of freedom.
    const result = chiSquareIndependence([[30, 20], [20, 30]]);

    assert.equal(result.chi2, 4);
    assert.equal(result.df, 1);
    assert.equal(result.minExpected, 25);
    assertClose(result.maxTvd, 0.1, 1e-14, 'maxTvd');
    // SciPy: chi2.sf(4, 1) = 0.045500263896358445.
    assertClose(result.pValue, 0.045500263896358445, 1e-12, 'pValue');
});

test('independent-by-construction table has zero effect size', () => {
    // Outer product of row weights (200, 300, 500) with column weights (0.2, 0.3, 0.5) at
    // N = 1000, so every observed count equals its expected count exactly.
    const result = chiSquareIndependence([
        [40, 60, 100],
        [60, 90, 150],
        [100, 150, 250]
    ]);

    assert.equal(result.chi2, 0);
    assert.equal(result.df, 4);
    assert.equal(result.pValue, 1);
    assert.equal(result.minExpected, 40);
    assert.equal(result.total, 1000);
    assert.equal(result.skipped, 0);
    assert.equal(result.maxTvd, 0);
    assert.equal(result.maxJsd, 0);
});

test('strongly dependent table has a large effect size', () => {
    // Perfectly correlated outcomes: each row puts all of its mass on one column.
    // Every expected count is 100 * 100 / 300 = 100/3, so
    // chi2 = 3 * ((200/3)^2 + 2 * (100/3)^2) / (100/3) = 600 on 4 degrees of freedom.
    const result = chiSquareIndependence([
        [100, 0, 0],
        [0, 100, 0],
        [0, 0, 100]
    ]);

    assertClose(result.chi2, 600, 1e-14, 'chi2');
    assert.equal(result.df, 4);
    assert.equal(result.rows, 3);
    assert.equal(result.cols, 3);
    assert.equal(result.skipped, 0);
    assertClose(result.minExpected, 100 / 3, 1e-14, 'minExpected');
    // Row conditional (1, 0, 0) against pooled (1/3, 1/3, 1/3): tvd = 0.5 * (2/3 + 1/3 + 1/3).
    assertClose(result.maxTvd, 2 / 3, 1e-14, 'maxTvd');
    assertClose(result.maxJsd, 0.45914791702724478, 1e-12, 'maxJsd');
    // SciPy: chi2.sf(600, 4) = 1.5496082669460377e-128.
    assertClose(result.pValue, 1.5496082669461261e-128, 1e-12, 'pValue');
});

test('a tiny effect at large N gives an astronomically small p-value', () => {
    // This is the reason the non-signaling check reports maxTvd alongside the p-value. A 1 point
    // shift in a conditional distribution is negligible next to hardware readout asymmetry, yet
    // at N = 200000 it lands at p = 4e-19.
    const result = chiSquareIndependence([[51000, 49000], [49000, 51000]]);

    assert.equal(result.chi2, 80);
    assert.equal(result.df, 1);
    assertClose(result.maxTvd, 0.01, 1e-13, 'maxTvd');
    assert.ok(result.pValue < 1e-15, 'p-value should be tiny, got ' + result.pValue);
    // SciPy: chi2.sf(80, 1) = 3.7440973842028864e-19.
    assertClose(result.pValue, 3.7440973842028864e-19, 1e-12, 'pValue');
});

test('all-zero table is degenerate, not NaN', () => {
    const result = chiSquareIndependence([[0, 0], [0, 0]]);

    assert.equal(result.chi2, 0);
    assert.equal(result.df, 0);
    assert.equal(result.pValue, 1);
    assert.equal(result.minExpected, 0);
    assert.equal(result.rows, 0);
    assert.equal(result.cols, 0);
    assert.equal(result.total, 0);
    assert.equal(result.skipped, 4);
    assert.equal(result.maxTvd, 0);
    assert.equal(result.maxJsd, 0);
    for (const value of Object.values(result)) {
        assert.ok(Number.isFinite(value), 'every field must be finite');
    }
});

test('empty table is degenerate, not NaN', () => {
    const result = chiSquareIndependence([]);

    assert.equal(result.chi2, 0);
    assert.equal(result.df, 0);
    assert.equal(result.pValue, 1);
    assert.equal(result.rows, 0);
    assert.equal(result.cols, 0);
    assert.equal(result.total, 0);
    assert.equal(result.maxTvd, 0);
});

test('single-row table has zero degrees of freedom', () => {
    const result = chiSquareIndependence([[10, 20, 30]]);

    assert.equal(result.chi2, 0);
    assert.equal(result.df, 0);
    assert.equal(result.pValue, 1);
    assert.equal(result.rows, 1);
    assert.equal(result.cols, 3);
    assert.equal(result.total, 60);
    assert.equal(result.skipped, 0);
    // With one row the expected counts equal the column totals.
    assert.equal(result.minExpected, 10);
    // A single row's conditional distribution is the pooled distribution.
    assert.equal(result.maxTvd, 0);
    assert.equal(result.maxJsd, 0);
});

test('single-column table has zero degrees of freedom', () => {
    const result = chiSquareIndependence([[10], [20], [30]]);

    assert.equal(result.chi2, 0);
    assert.equal(result.df, 0);
    assert.equal(result.pValue, 1);
    assert.equal(result.rows, 3);
    assert.equal(result.cols, 1);
    assert.equal(result.maxTvd, 0);
});

test('an all-zero row is skipped and does not change the result', () => {
    const reference = chiSquareIndependence([[10, 20], [30, 40]]);
    const withZeroRow = chiSquareIndependence([[10, 20], [0, 0], [30, 40]]);

    assert.equal(withZeroRow.skipped, 1);
    assert.equal(withZeroRow.rows, 2);
    assert.equal(withZeroRow.cols, 2);
    assert.equal(withZeroRow.chi2, reference.chi2);
    assert.equal(withZeroRow.df, reference.df);
    assert.equal(withZeroRow.pValue, reference.pValue);
    assert.equal(withZeroRow.minExpected, reference.minExpected);
    assert.equal(withZeroRow.maxTvd, reference.maxTvd);
    assert.equal(withZeroRow.maxJsd, reference.maxJsd);
});

test('an all-zero column is skipped and does not change the result', () => {
    const reference = chiSquareIndependence([[10, 20], [30, 40]]);
    const withZeroCol = chiSquareIndependence([[10, 0, 20], [30, 0, 40]]);

    assert.equal(withZeroCol.skipped, 1);
    assert.equal(withZeroCol.rows, 2);
    assert.equal(withZeroCol.cols, 2);
    assert.equal(withZeroCol.chi2, reference.chi2);
    assert.equal(withZeroCol.pValue, reference.pValue);
    assert.equal(withZeroCol.maxTvd, reference.maxTvd);
});

test('a zero row and a zero column are both counted in skipped', () => {
    const result = chiSquareIndependence([
        [10, 0, 20],
        [0, 0, 0],
        [30, 0, 40]
    ]);

    assert.equal(result.skipped, 2);
    assert.equal(result.rows, 2);
    assert.equal(result.cols, 2);
    assert.equal(result.chi2, 50 / 63);
});

test('maxTvd and maxJsd stay inside their ranges', () => {
    const tables = [
        [[10, 20], [30, 40]],
        [[100, 0, 0], [0, 100, 0], [0, 0, 100]],
        [[1, 1, 1, 1], [1, 1, 1, 1]],
        [[1, 0], [0, 1]],
        [[7, 3, 0], [0, 5, 5], [2, 2, 9]]
    ];
    for (const table of tables) {
        const result = chiSquareIndependence(table);
        assert.ok(result.maxTvd >= 0 && result.maxTvd <= 1, 'maxTvd out of range');
        assert.ok(result.maxJsd >= 0 && result.maxJsd <= 1, 'maxJsd out of range');
        assert.ok(result.pValue >= 0 && result.pValue <= 1, 'pValue out of range');
        assert.ok(Number.isFinite(result.chi2) && result.chi2 >= 0, 'chi2 out of range');
    }
});

test('malformed tables throw', () => {
    assert.throws(() => chiSquareIndependence(null), TypeError);
    assert.throws(() => chiSquareIndependence('nope'), TypeError);
    assert.throws(() => chiSquareIndependence([1, 2]), TypeError);
    assert.throws(() => chiSquareIndependence([[1, 2], [3]]), TypeError);
    assert.throws(() => chiSquareIndependence([[1, -2], [3, 4]]), TypeError);
    assert.throws(() => chiSquareIndependence([[1, NaN], [3, 4]]), TypeError);
    assert.throws(() => chiSquareIndependence([[1, Infinity], [3, 4]]), TypeError);
    assert.throws(() => chiSquareIndependence([[1, '2'], [3, 4]]), TypeError);
});

test('a proto-polluting key on the input array is inert', () => {
    // Counts tables are built from untrusted submission data, so the array path must not care
    // about inherited keys.
    const table = [[10, 20], [30, 40]];
    table['__proto__x'] = [999, 999];
    const result = chiSquareIndependence(table);
    assert.equal(result.rows, 2);
    assert.equal(result.total, 100);
    assert.equal(result.chi2, 50 / 63);
});
