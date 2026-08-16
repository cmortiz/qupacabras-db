/**
 * Tests for `scripts/lib/nlg/stats.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/`. These use `node:test`, not Jest, and live
 * under `scripts/` where the CRA Jest runner does not look.
 *
 * Two independent sources of truth are used.
 *
 * 1. `fixtures/special-fn-goldens.json`, generated from SciPy 1.13.1. SciPy is not available in
 *    CI and the port cannot regenerate these, so they are committed.
 * 2. The vendored corpus under `nlg_data_extracted/data/`, whose `db.json` records were produced
 *    by the Python reference implementation being ported. Every file is read inside a test body,
 *    never at module load time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const stats = require('../stats');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'nlg_data_extracted', 'data');
const EXPERIMENTS_DIR = path.join(DATA_DIR, 'experiments');
const GOLDENS_PATH = path.join(__dirname, 'fixtures', 'special-fn-goldens.json');

/** Relative tolerance against the SciPy goldens. */
const GOLDEN_RTOL = 2e-11;

/** Optimal classical value of G14, `43 / 44`. Cross-checked against `db.json` below. */
const G14_OMEGA_C = 43 / 44;

/**
 * @param {string} filePath - Absolute path to a JSON file.
 * @returns {*} Parsed contents.
 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Per-question win rates as stored in a vendored result file.
 *
 * The stored values are used rather than values recomputed from the counts. For the 12 known-bad
 * fixtures the two disagree, and `db.json` was computed from the stored ones, so feeding stored
 * win rates is what reproduces the published corpus.
 *
 * @param {string} resultFile - File name such as `result_11.json`.
 * @returns {number[]} Stored per-question win rates.
 */
function storedWinRates(resultFile) {
    return readJson(path.join(EXPERIMENTS_DIR, resultFile)).results.map((entry) => entry.win_rate);
}

/**
 * Vendored experiment records whose result file is present in the tree. Ids 12 and 15 point at
 * `raw_data/duke_collab/...`, which is not vendored, and are excluded.
 *
 * @returns {Array<{id: string, record: Object, resultFile: string}>} Usable records.
 */
function vendoredExperiments() {
    const db = readJson(path.join(DATA_DIR, 'db.json'));
    const out = [];
    for (const id of Object.keys(db.experiments)) {
        const record = db.experiments[id];
        const resultPath = record.circuit_data && record.circuit_data.result_path;
        if (typeof resultPath === 'string' && resultPath.startsWith('experiments/')) {
            out.push({ id, record, resultFile: path.basename(resultPath) });
        }
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Special functions against the SciPy goldens
 * ------------------------------------------------------------------ */

test('chiSquareSf matches the SciPy goldens', () => {
    const goldens = readJson(GOLDENS_PATH).chiSquareSf;
    assert.equal(goldens.length, 202);

    let worst = 0;
    let worstCase = null;

    for (const golden of goldens) {
        const got = stats.chiSquareSf(golden.x, golden.df);
        const label = 'x=' + golden.x + ', df=' + golden.df;

        if (golden.sf === 0) {
            assert.equal(got, 0, 'expected exact zero at ' + label);
            continue;
        }
        if (golden.sf === 1) {
            assert.equal(got, 1, 'expected exact one at ' + label);
            continue;
        }
        if (golden.sf < 1e-300) {
            // Subnormal territory: relative error is not meaningful there.
            assert.ok(got < 1e-300, 'expected a subnormal result at ' + label);
            continue;
        }

        const rel = Math.abs(got - golden.sf) / golden.sf;
        assert.ok(
            rel <= GOLDEN_RTOL,
            'chiSquareSf(' + label + ') = ' + got + ', want ' + golden.sf + ', rel ' + rel
        );
        if (rel > worst) {
            worst = rel;
            worstCase = label;
        }
    }

    // Recorded so a regression in the special functions is visible, not just red.
    assert.ok(worst <= GOLDEN_RTOL, 'worst relative error ' + worst + ' at ' + worstCase);
});

test('gammq matches the SciPy goldens', () => {
    const goldens = readJson(GOLDENS_PATH).gammq;
    assert.equal(goldens.length, 111);

    let worst = 0;
    let worstCase = null;

    for (const golden of goldens) {
        const got = stats.gammq(golden.a, golden.x);
        const label = 'a=' + golden.a + ', x=' + golden.x;

        if (golden.q === 0) {
            assert.equal(got, 0, 'expected exact zero at ' + label);
            continue;
        }
        if (golden.q === 1) {
            assert.equal(got, 1, 'expected exact one at ' + label);
            continue;
        }
        if (golden.q < 1e-300) {
            assert.ok(got < 1e-300, 'expected a subnormal result at ' + label);
            continue;
        }

        const rel = Math.abs(got - golden.q) / golden.q;
        assert.ok(
            rel <= GOLDEN_RTOL,
            'gammq(' + label + ') = ' + got + ', want ' + golden.q + ', rel ' + rel
        );
        if (rel > worst) {
            worst = rel;
            worstCase = label;
        }
    }

    assert.ok(worst <= GOLDEN_RTOL, 'worst relative error ' + worst + ' at ' + worstCase);
});

test('chiSquareSf is gammq(df / 2, x / 2)', () => {
    for (const [x, df] of [[1, 1], [3.5, 2], [10, 7], [120, 100], [441, 441]]) {
        assert.equal(stats.chiSquareSf(x, df), stats.gammq(df / 2, x / 2));
    }
});

test('special function edges', () => {
    assert.equal(stats.chiSquareSf(0, 1), 1);
    assert.equal(stats.chiSquareSf(-1, 4), 1);
    assert.equal(stats.gammq(2, 0), 1);

    assert.throws(() => stats.chiSquareSf(1, 0), RangeError);
    assert.throws(() => stats.chiSquareSf(1, 0.5), RangeError);
    assert.throws(() => stats.chiSquareSf(NaN, 1), TypeError);
    assert.throws(() => stats.chiSquareSf(Infinity, 1), TypeError);
    assert.throws(() => stats.chiSquareSf(1, NaN), TypeError);

    assert.throws(() => stats.gammq(0, 1), RangeError);
    assert.throws(() => stats.gammq(-1, 1), RangeError);
    assert.throws(() => stats.gammq(1, -1), RangeError);
    assert.throws(() => stats.gammq(NaN, 1), TypeError);
    assert.throws(() => stats.gammq(1, Infinity), TypeError);
});

test('chiSquareSf is monotone decreasing in x and bounded', () => {
    for (const df of [1, 2, 5, 30, 441]) {
        let previous = 1;
        for (const x of [0.5, 1, 2, 5, 10, 25, 60, 150, 400, 900]) {
            const got = stats.chiSquareSf(x, df);
            assert.ok(got >= 0 && got <= 1, 'out of range at x=' + x + ', df=' + df);
            assert.ok(got <= previous, 'not decreasing at x=' + x + ', df=' + df);
            previous = got;
        }
    }
});

/* ------------------------------------------------------------------ *
 * Bit-exact reproduction of db.json
 * ------------------------------------------------------------------ */

test('exact goldens from the vendored corpus', () => {
    assert.equal(
        stats.calculatePValue(storedWinRates('result_14.json'), 2000, G14_OMEGA_C),
        0.04675268138851943
    );
    assert.equal(stats.bernoulliVariance(storedWinRates('result_11.json')), 0.12253573807803067);
    assert.equal(stats.bernoulliVariance(storedWinRates('result_14.json')), 0.020363828642740694);
    assert.equal(stats.calculateCi(storedWinRates('result_11.json'), 1024), 0.005569009766859011);
    assert.equal(stats.calculateCi(storedWinRates('result_14.json'), 2000), 0.0024432720146268135);
});

test('calculatePValue early-returns exactly 1 on result_11', () => {
    const p = stats.calculatePValue(storedWinRates('result_11.json'), 1024, G14_OMEGA_C);
    assert.equal(p, 1);
    assert.equal(typeof p, 'number');
    assert.ok(Object.is(p, 1), 'the early return yields the number 1, not -0 or a near-1 value');
});

test('db.json omegaC is 43 / 44', () => {
    const db = readJson(path.join(DATA_DIR, 'db.json'));
    const game = db.games[Object.keys(db.games)[0]];
    assert.equal(game.optimal_classical_value, 0.9772727272727273);
    assert.equal(game.optimal_classical_value, G14_OMEGA_C);
});

/**
 * Recomputes the three uncertainty fields for every usable vendored record.
 *
 * @returns {Array<{id: string, ciDiff: number, varDiff: number, pDiff: number}>} Per-record
 *   absolute differences against `db.json`.
 */
function reproduceVendoredCorpus() {
    const db = readJson(path.join(DATA_DIR, 'db.json'));
    const omegaC = db.games[Object.keys(db.games)[0]].optimal_classical_value;

    return vendoredExperiments().map(({ id, record, resultFile }) => {
        const winrates = storedWinRates(resultFile);
        const shots = record.circuit_data.shots;
        return {
            id,
            ciDiff: Math.abs(stats.calculateCi(winrates, shots) - record.win_rate.ci95),
            varDiff: Math.abs(stats.bernoulliVariance(winrates) - record.win_rate.var),
            pDiff: Math.abs(
                stats.calculatePValue(winrates, shots, omegaC) - record.win_rate.p_value
            )
        };
    });
}

test('every vendored record reproduces its db.json uncertainty fields', () => {
    const diffs = reproduceVendoredCorpus();
    assert.equal(diffs.length, 38);

    for (const { id, ciDiff, varDiff, pDiff } of diffs) {
        assert.ok(ciDiff <= 1e-12, 'ci95 mismatch on experiment ' + id + ': ' + ciDiff);
        assert.ok(varDiff <= 1e-12, 'var mismatch on experiment ' + id + ': ' + varDiff);
        assert.ok(pDiff <= 1e-12, 'p_value mismatch on experiment ' + id + ': ' + pDiff);
    }
});

test('the vendored corpus reproduces bit for bit', () => {
    // Reproducing NumPy's pairwise summation order makes all 38 records exact, not merely close.
    // This is deliberately a separate test from the 1e-12 one above: `calculateCi` and
    // `calculatePValue` call `Math.log` and `Math.exp`, whose last bit is a V8 implementation
    // detail rather than an IEEE-754 guarantee. If a future engine moves one of them, this test
    // going red on its own is the correct signal, and the tolerance-based test stays green.
    for (const { id, ciDiff, varDiff, pDiff } of reproduceVendoredCorpus()) {
        assert.equal(ciDiff, 0, 'ci95 is expected to reproduce exactly on experiment ' + id);
        assert.equal(varDiff, 0, 'var is expected to reproduce exactly on experiment ' + id);
        assert.equal(pDiff, 0, 'p_value is expected to reproduce exactly on experiment ' + id);
    }
});

/* ------------------------------------------------------------------ *
 * Invariants
 * ------------------------------------------------------------------ */

test('calculateCi is positive and decreasing in shots', () => {
    const winrates = [0.9, 0.8, 0.95, 0.7, 0.99];
    let previous = Infinity;
    for (const shots of [64, 256, 1024, 4096, 20000]) {
        const ci = stats.calculateCi(winrates, shots);
        assert.ok(ci > 0, 'ci must be positive at shots=' + shots);
        assert.ok(ci < previous, 'ci must decrease at shots=' + shots);
        previous = ci;
    }
});

test('calculateCi widens as d shrinks', () => {
    const winrates = [0.9, 0.8, 0.95];
    assert.ok(stats.calculateCi(winrates, 1024, 0.01) > stats.calculateCi(winrates, 1024, 0.05));
});

test('calculatePValue returns exactly 1 when the mean is below omegaC', () => {
    const winrates = [0.5, 0.6, 0.7];
    assert.equal(stats.calculatePValue(winrates, 1024, 0.9), 1);
    // Equality is not below, so the general branch runs and exp(0) is also 1.
    assert.equal(stats.calculatePValue([0.8, 0.8], 1024, 0.8), 1);
});

test('calculatePValue shrinks as the margin over omegaC grows', () => {
    let previous = 1;
    for (const w of [0.90, 0.92, 0.94, 0.96, 0.98]) {
        const p = stats.calculatePValue([w, w, w, w], 2000, 0.89);
        assert.ok(p > 0 && p <= 1, 'p out of range at w=' + w);
        assert.ok(p < previous, 'p must shrink at w=' + w);
        previous = p;
    }
});

test('mean and bernoulliVariance on simple inputs', () => {
    assert.equal(stats.mean([1, 2, 3, 4]), 2.5);
    assert.equal(stats.mean([0.5]), 0.5);
    assert.equal(stats.bernoulliVariance([0.5]), 0.25);
    assert.equal(stats.bernoulliVariance([1, 0]), 0);
    // 200 entries exercises the recursive branch of the pairwise sum.
    assert.equal(stats.mean(new Array(200).fill(0.25)), 0.25);
});

test('empty and malformed input throws rather than yielding NaN', () => {
    assert.throws(() => stats.mean([]), RangeError);
    assert.throws(() => stats.bernoulliVariance([]), RangeError);
    assert.throws(() => stats.calculateCi([], 1024), RangeError);
    assert.throws(() => stats.calculatePValue([], 1024, 0.9), RangeError);

    assert.throws(() => stats.mean('nope'), TypeError);
    assert.throws(() => stats.mean([1, NaN]), TypeError);
    assert.throws(() => stats.mean([1, null]), TypeError);
    assert.throws(() => stats.calculateCi([0.9], 0), RangeError);
    assert.throws(() => stats.calculateCi([0.9], 1024, 0), RangeError);
    assert.throws(() => stats.calculateCi([0.9], '1024'), TypeError);
    assert.throws(() => stats.calculatePValue([0.9], -1, 0.9), RangeError);
    assert.throws(() => stats.calculatePValue([0.9], 1024, NaN), TypeError);
});
