/**
 * Tests for `scripts/lib/nlg/stats.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/`. These use `node:test`, not Jest, and live
 * under `scripts/` where the CRA Jest runner does not look.
 *
 * Two independent sources of truth are used.
 *
 * 1. SciPy: `fixtures/special-fn-goldens.json`, generated from SciPy 1.13.1, plus the binomial
 *    tail and lower-bound references committed inline below. SciPy is not available in CI and
 *    the tests cannot regenerate these, so they are committed.
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
 * Exact binomial tail and the Clopper-Pearson lower bound
 * ------------------------------------------------------------------ */

/** One-sided 3-sigma tail, the default significance target of certifiedWinRateLowerBound. */
const THREE_SIGMA_P = 0.0013498980316300946;

/** Relative tolerance against the SciPy-computed binomial references. */
const BINOMIAL_RTOL = 1e-10;

/**
 * Reference values computed independently with `scipy.stats.binom.sf(k - 1, N, omegaC)` on the
 * pooled count `k = round(shots * sum(winrates))`, `N = winrates.length * shots`. SciPy is not
 * available in CI, so the values are committed here, the same arrangement as the special-function
 * goldens above.
 */
const BINOMIAL_TAIL_GOLDENS = [
    { winrates: new Array(26).fill(0.99), shots: 189, omegaC: 0.9615384615384616,
        p: 8.24153699232779e-35 },
    { winrates: new Array(58).fill(0.9893), shots: 734, omegaC: 0.9827586206896551,
        p: 6.660870596647284e-29 },
    { winrates: [].concat(...new Array(3).fill([0.98, 0.99, 1.0, 0.97])), shots: 500,
        omegaC: 0.95, p: 9.368032485928021e-48 },
    { winrates: new Array(8).fill(0.86), shots: 1000, omegaC: 0.75,
        p: 3.1706842671595316e-129 },
    { winrates: new Array(26).fill(0.970354), shots: 306, omegaC: 0.9615384615384616,
        p: 1.3011597425119978e-05 }
];

/**
 * Reference lower bounds at the 3-sigma target, computed independently in Python with the same
 * 60-step bisection on `scipy.stats.binom.sf`.
 */
const LOWER_BOUND_GOLDENS = [
    { winrates: new Array(26).fill(0.99), shots: 189, omegaLB: 0.9850001070157383 },
    { winrates: new Array(26).fill(0.970354), shots: 306, omegaLB: 0.9641830135289756 },
    { winrates: new Array(10).fill(0.9495), shots: 1172, omegaLB: 0.9431300785823842 }
];

test('binomialTailPValue matches the SciPy references', () => {
    for (const golden of BINOMIAL_TAIL_GOLDENS) {
        const got = stats.binomialTailPValue(golden.winrates, golden.shots, golden.omegaC);
        const rel = Math.abs(got - golden.p) / golden.p;
        assert.ok(rel <= BINOMIAL_RTOL,
            'shots=' + golden.shots + ', omegaC=' + golden.omegaC + ': got ' + got +
                ', want ' + golden.p + ', rel ' + rel);
    }
});

test('binomialTailPValue returns exactly 1 when the pooled count is not above N * omegaC', () => {
    const p = stats.binomialTailPValue(new Array(10).fill(0.5), 100, 0.75);
    assert.equal(p, 1);
    assert.ok(Object.is(p, 1), 'the early return yields the number 1, not -0 or a near-1 value');
    // Equality is not above either: 500 wins in 1000 trials at omegaC = 0.5.
    assert.equal(stats.binomialTailPValue([0.5, 0.5], 500, 0.5), 1);
});

test('certifiedWinRateLowerBound matches the SciPy references and defaults to 3 sigma', () => {
    for (const golden of LOWER_BOUND_GOLDENS) {
        const got = stats.certifiedWinRateLowerBound(golden.winrates, golden.shots,
            THREE_SIGMA_P);
        assert.ok(Math.abs(got - golden.omegaLB) <= 1e-12,
            'shots=' + golden.shots + ': got ' + got + ', want ' + golden.omegaLB);
        assert.equal(got, stats.certifiedWinRateLowerBound(golden.winrates, golden.shots),
            'the default pTarget must be the one-sided 3-sigma tail');
    }
});

test('certifiedWinRateLowerBound gives the certified nonlocal content of the references', () => {
    // certifiedPnl = 1 - 2n(1 - omegaLB) for the odd cycle C_n, the quantity verify.js derives.
    const cases = [
        { golden: LOWER_BOUND_GOLDENS[0], n: 13, pnl: 0.6100027824091947 },
        { golden: LOWER_BOUND_GOLDENS[1], n: 13, pnl: 0.06875835175336609 },
        { golden: LOWER_BOUND_GOLDENS[2], n: 5, pnl: 0.4313007858238418 }
    ];
    for (const { golden, n, pnl } of cases) {
        const omegaLB = stats.certifiedWinRateLowerBound(golden.winrates, golden.shots);
        const got = 1 - 2 * n * (1 - omegaLB);
        const rel = Math.abs(got - pnl) / pnl;
        assert.ok(rel <= BINOMIAL_RTOL, 'n=' + n + ': got ' + got + ', want ' + pnl);
    }
});

test('binomialTailPValue is monotone: larger win rates and smaller omegaC shrink it', () => {
    let previous = 1;
    for (const w of [0.90, 0.92, 0.94, 0.96, 0.98]) {
        const p = stats.binomialTailPValue([w, w, w, w], 2000, 0.89);
        assert.ok(p > 0 && p <= 1, 'p out of range at w=' + w);
        assert.ok(p < previous, 'p must shrink at w=' + w);
        previous = p;
    }
    const tight = stats.binomialTailPValue([0.95, 0.95], 1000, 0.9);
    const loose = stats.binomialTailPValue([0.95, 0.95], 1000, 0.92);
    assert.ok(tight < loose, 'the tail must grow with omegaC');
});

test('the exact tail is never larger than the Bernstein bound on the same counts', () => {
    // Hoeffding's binomial tail is the sharp bound the Bernstein inequality loosens, so on any
    // common input the exact figure must be at most the ported one.
    for (const w of [0.9, 0.93, 0.96, 0.99]) {
        const winrates = new Array(12).fill(w);
        const bernstein = stats.calculatePValue(winrates, 1024, 0.88);
        const exact = stats.binomialTailPValue(winrates, 1024, 0.88);
        assert.ok(exact <= bernstein,
            'w=' + w + ': exact ' + exact + ' must not exceed Bernstein ' + bernstein);
    }
});

test('certifiedWinRateLowerBound sits below the pooled rate and tightens with shots', () => {
    const winrates = new Array(10).fill(0.95);
    let previous = 0;
    for (const shots of [100, 400, 1600, 6400]) {
        const lb = stats.certifiedWinRateLowerBound(winrates, shots);
        assert.ok(lb < 0.95, 'the lower bound must sit below the observed rate at ' + shots);
        assert.ok(lb > previous, 'more shots must tighten the bound at ' + shots);
        previous = lb;
    }
    // A weaker target certifies more: the bound grows with pTarget.
    assert.ok(stats.certifiedWinRateLowerBound(winrates, 1000, 0.05) >
        stats.certifiedWinRateLowerBound(winrates, 1000, THREE_SIGMA_P));
    // A pooled count of zero certifies nothing at all.
    assert.equal(stats.certifiedWinRateLowerBound([0, 0, 0], 100), 0);
});

test('binomialTailPValue and certifiedWinRateLowerBound reject malformed input', () => {
    assert.throws(() => stats.binomialTailPValue([], 1024, 0.9), RangeError);
    assert.throws(() => stats.binomialTailPValue([0.9], 0, 0.9), RangeError);
    assert.throws(() => stats.binomialTailPValue([0.9], 1024.5, 0.9), RangeError);
    assert.throws(() => stats.binomialTailPValue([0.9], '1024', 0.9), TypeError);
    assert.throws(() => stats.binomialTailPValue([0.9], 1024, -0.1), RangeError);
    assert.throws(() => stats.binomialTailPValue([0.9], 1024, 1.1), RangeError);
    assert.throws(() => stats.binomialTailPValue([0.9], 1024, NaN), TypeError);
    assert.throws(() => stats.binomialTailPValue([0.9, NaN], 1024, 0.9), TypeError);

    assert.throws(() => stats.certifiedWinRateLowerBound([], 1024), RangeError);
    assert.throws(() => stats.certifiedWinRateLowerBound([0.9], -1), RangeError);
    assert.throws(() => stats.certifiedWinRateLowerBound([0.9], 10.5), RangeError);
    assert.throws(() => stats.certifiedWinRateLowerBound([0.9], 1024, 0), RangeError);
    assert.throws(() => stats.certifiedWinRateLowerBound([0.9], 1024, 1), RangeError);
    assert.throws(() => stats.certifiedWinRateLowerBound([0.9], 1024, NaN), TypeError);
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
