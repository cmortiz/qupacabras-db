/**
 * Tests for `scripts/lib/nlg/verify.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/*.test.js` (unquoted, so the shell expands the
 * glob).
 *
 * The vendored corpus under `nlg_data_extracted/data/` is the real evidence here. Its 38 result
 * files record the per-question counts behind 38 published win rates, and 12 of them are known to
 * be wrong in a specific way, which makes them negative fixtures no synthetic case could replace:
 * they are what the failure this project exists to catch actually looks like.
 *
 * The vendored files use an older counts encoding, `"<a>,<b>"` with decimal colours. `toCountsDoc`
 * below converts one to the pinned format. The converter lives in this test rather than in
 * `counts.js` because it describes a historical file layout, not the format the verifier accepts.
 *
 * Every file is read inside a test body, never at module load time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const verify = require('../verify');
const counts = require('../counts');
const registry = require('../registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'nlg_data_extracted', 'data');
const EXPERIMENTS_DIR = path.join(DATA_DIR, 'experiments');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'submissions', 'template');

/**
 * Vendored experiments whose recomputed win rate equals the published one exactly, as recorded in
 * the project's pinned facts. Ids 12 and 15 have no vendored result file.
 */
const CLEAN_IDS = [11, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
    35, 36, 37, 38, 39, 40];

/**
 * The two clean fixtures whose question keys do not match the registered G14 game.
 *
 * `result_16` and `result_20` carry the same abstract graph under a different vertex labelling:
 * an isomorphism found by search maps the registered G14 onto theirs by swapping vertices 7 and 8
 * and vertices 10 and 12. Their win rates reproduce exactly, because the win rule depends only on
 * whether the two question indices are equal, but against the registered 88-question G14 their
 * key set has 16 unknown keys and 16 missing ones. See the test below.
 */
const RELABELLED_IDS = [16, 20];

/**
 * @param {string} filePath - Absolute path to a JSON file.
 * @returns {*} Parsed contents.
 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Convert one vendored result file to the pinned counts format.
 *
 * The vendored shape is `results: [{circuit: [x, y], win_rate, counts: {"<a>,<b>": n}}]` with `a`
 * and `b` decimal colours in 0..3. The pinned shape keys questions as `"<x>|<y>"` and answers as
 * fixed-width binary, so colour 3 becomes `"11"` and the pair (1, 2) becomes `"01:10"`.
 *
 * @param {string} resultFile - File name such as `result_11.json`.
 * @param {number} [bits=2] - Fixed answer width, 2 for a four-colour game.
 * @returns {Object} A counts document.
 */
function toCountsDoc(resultFile, bits) {
    const width = bits === undefined ? 2 : bits;
    const raw = readJson(path.join(EXPERIMENTS_DIR, resultFile));
    const table = {};
    raw.results.forEach((entry) => {
        const answers = {};
        Object.keys(entry.counts).forEach((key) => {
            const parts = key.split(',');
            const a = Number(parts[0]);
            const b = Number(parts[1]);
            answers[counts.encodeAnswerKey(a, b, width, width)] = entry.counts[key];
        });
        table[counts.encodeQuestionKey(entry.circuit[0], entry.circuit[1])] = answers;
    });
    return { schemaVersion: 1, counts: table };
}

/**
 * Build the benchmark a vendored experiment would have submitted, using the published record as
 * the claim under test.
 *
 * @param {Object} record - One `db.json` experiment record.
 * @returns {Object} A benchmark object carrying a `nonlocalGame` block.
 */
function toBenchmark(record) {
    return {
        algorithmName: 'G14 graph coloring',
        device: record.device.provider + ' ' + record.device.name,
        metricName: 'Win Rate',
        metricValue: record.win_rate.value,
        nonlocalGame: {
            game: 'g14',
            winRate: record.win_rate.value,
            shotsPerCircuit: record.circuit_data.shots,
            countsFile: 'counts.json',
            uncertainty: record.win_rate.ci95
        }
    };
}

/**
 * @param {number} id - Experiment id.
 * @returns {{record: Object, benchmark: Object, doc: Object}} Everything a check needs.
 */
function fixture(id) {
    const record = readJson(path.join(DATA_DIR, 'db.json')).experiments[String(id)];
    return {
        record: record,
        benchmark: toBenchmark(record),
        doc: toCountsDoc('result_' + id + '.json')
    };
}

/**
 * @param {Array<{code: string}>} issues - Errors or warnings.
 * @returns {string[]} Their codes.
 */
function codesOf(issues) {
    return issues.map((entry) => entry.code);
}

/**
 * @param {Object} verification - A verification block.
 * @param {string} id - A check id.
 * @returns {string} The check's status.
 */
function checkStatus(verification, id) {
    return verification.checks.find((check) => check.id === id).status;
}

/**
 * Build a G14 counts document with a chosen number of winning shots per question.
 *
 * @param {number} shots - Shots per question.
 * @param {function(number): number} winsFor - Wins for the question at that index.
 * @returns {Object} A counts document.
 */
function syntheticG14(shots, winsFor) {
    const game = registry.getGame('g14');
    const table = {};
    game.questions.forEach((question, index) => {
        const wins = winsFor(index);
        const winningKey = question.x === question.y ? '00:00' : '00:01';
        const losingKey = question.x === question.y ? '00:01' : '00:00';
        const answers = {};
        answers[winningKey] = wins;
        answers[losingKey] = shots - wins;
        table[question.key] = answers;
    });
    return { schemaVersion: 1, counts: table };
}

/* ------------------------------------------------------------------ *
 * Interface stability
 * ------------------------------------------------------------------ */

test('the five check ids and the verifier version are stable', () => {
    assert.deepEqual(Object.keys(verify.CHECK_IDS).sort(),
        ['NON_SIGNALING', 'STRUCTURE', 'SUPERQUANTUM', 'UNCERTAINTY', 'WIN_RATE']);
    Object.keys(verify.CHECK_IDS).forEach((key) => {
        assert.equal(verify.CHECK_IDS[key], key);
    });
    assert.equal(verify.VERIFIER_VERSION, 1);
});

/* ------------------------------------------------------------------ *
 * Positive reproduction
 * ------------------------------------------------------------------ */

test('the clean vendored fixtures reproduce their published win rate exactly', () => {
    const expectedExact = CLEAN_IDS.filter((id) => RELABELLED_IDS.indexOf(id) === -1);
    const reproduced = [];
    const failed = [];

    expectedExact.forEach((id) => {
        const { record, benchmark, doc } = fixture(id);
        const result = verify.verifyNonlocalGame(benchmark, doc, {});
        const delta = result.verification.winRate.delta;
        if (result.valid && delta === 0) {
            reproduced.push(id);
        } else {
            failed.push({ id: id, delta: delta, codes: codesOf(result.errors) });
        }
        assert.equal(result.verification.winRate.recomputedMean, record.win_rate.value,
            'result_' + id + ' must recompute to its published value bit for bit');
        assert.equal(delta, 0, 'result_' + id + ' delta must be exactly 0');
        assert.equal(result.verification.status, 'verified');
        assert.equal(result.verification.ranked, true);
    });

    assert.deepEqual(failed, []);
    assert.equal(reproduced.length, 24);
});

test('result_16 and result_20 reproduce exactly but use a relabelled G14', () => {
    const game = registry.getGame('g14');
    const registered = new Set(game.questions.map((question) => question.key));

    // The isomorphism, found by exhaustive search over degree-compatible vertex maps.
    const relabel = { 7: 8, 8: 7, 10: 12, 12: 10 };
    const apply = (vertex) => (Object.prototype.hasOwnProperty.call(relabel, vertex)
        ? relabel[vertex]
        : vertex);

    RELABELLED_IDS.forEach((id) => {
        const { record, benchmark, doc } = fixture(id);
        const result = verify.verifyNonlocalGame(benchmark, doc, {});

        // Structurally invalid against the registered labelling.
        const codes = codesOf(result.errors);
        assert.ok(codes.includes('UNKNOWN_QUESTION'), 'result_' + id + ' has unknown questions');
        assert.ok(codes.includes('MISSING_QUESTION'), 'result_' + id + ' has missing questions');
        assert.equal(result.verification.winRate.questions, 72);
        assert.equal(result.verification.ranked, false);

        // Relabelling the vertices lands exactly on the registered question set.
        const relabelled = {};
        Object.keys(doc.counts).forEach((key) => {
            const parsed = counts.parseQuestionKey(key);
            relabelled[counts.encodeQuestionKey(apply(parsed.x), apply(parsed.y))] =
                doc.counts[key];
        });
        const relabelledKeys = Object.keys(relabelled);
        assert.equal(relabelledKeys.length, 88);
        relabelledKeys.forEach((key) => {
            assert.ok(registered.has(key), 'relabelled key ' + key + ' must be a G14 question');
        });

        // And then the win rate reproduces exactly, as it does for the other 24.
        const fixed = verify.verifyNonlocalGame(benchmark, { schemaVersion: 1, counts: relabelled }, {});
        assert.equal(fixed.verification.winRate.recomputedMean, record.win_rate.value);
        assert.equal(fixed.verification.winRate.delta, 0);
        assert.equal(fixed.verification.status, 'verified');
    });
});

test('the shipped template verifies and ranks', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const result = verify.verifyNonlocalGame(benchmark, doc, {});

    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(result.verification.status, 'verified');
    assert.equal(result.verification.ranked, true);
    assert.equal(result.verification.game.id, 'odd-cycle:n=3');
    assert.equal(result.verification.winRate.delta, 0);
    assert.equal(result.verification.winRate.shotsPerCircuit, 1024);
    assert.equal(result.verification.uncertainty.approximate, false);
});

/* ------------------------------------------------------------------ *
 * Negative fixtures
 * ------------------------------------------------------------------ */

test('result_1 fails reproduction, and its counts are byte-identical to result_11', () => {
    const one = fixture(1);
    const eleven = fixture(11);

    assert.equal(JSON.stringify(one.doc), JSON.stringify(eleven.doc),
        'result_1 carries result_11 counts, because ingest_old_ibm_data.py read win rates per ' +
        'job but counts from one un-keyed CSV');

    const result = verify.verifyNonlocalGame(one.benchmark, one.doc, {});
    assert.equal(result.valid, false);
    assert.ok(codesOf(result.errors).includes('WIN_RATE_MISMATCH'));
    assert.equal(checkStatus(result.verification, 'WIN_RATE'), 'fail');
    assert.equal(result.verification.status, 'failed');
    assert.equal(result.verification.ranked, false);

    // It reproduces result_11's number, not its own.
    assert.equal(result.verification.winRate.recomputedMean, eleven.record.win_rate.value);
    assert.ok(result.verification.winRate.delta > 1e-4);

    // The structure itself is fine: this is a wrong number, not a malformed file.
    assert.equal(checkStatus(result.verification, 'STRUCTURE'), 'pass');
});

test('result_13 and result_14 trip SHOTS_MISMATCH and a missing-question error', () => {
    const expectedRange = { 13: [1998, 2002], 14: [1997, 2002] };

    [13, 14].forEach((id) => {
        const { benchmark, doc } = fixture(id);
        const result = verify.verifyNonlocalGame(benchmark, doc, {});
        const codes = codesOf(result.errors);

        assert.ok(codes.includes('SHOTS_MISMATCH'), 'result_' + id + ' must trip SHOTS_MISMATCH');
        assert.ok(codes.includes('MISSING_QUESTION'),
            'result_' + id + ' carries 51 questions, so 37 of the 88 G14 keys are absent');

        assert.equal(result.verification.winRate.questions, 51);
        assert.equal(result.verification.winRate.shotsMin, expectedRange[id][0]);
        assert.equal(result.verification.winRate.shotsMax, expectedRange[id][1]);
        assert.equal(result.verification.winRate.shotsPerCircuit, null);

        assert.match(
            result.errors.find((e) => e.code === 'MISSING_QUESTION').message,
            /^37 of the 88 questions/
        );

        // The win rate itself lands INSIDE the 1e-4 error tolerance. These files fail on
        // structure, not on arithmetic, and asserting a win-rate failure here would be false.
        assert.ok(result.verification.winRate.delta < 1e-4,
            'result_' + id + ' delta is ' + result.verification.winRate.delta);
        assert.ok(codes.includes('WIN_RATE_MISMATCH') === false);
        assert.ok(codesOf(result.warnings).includes('WIN_RATE_DRIFT'));
    });
});

test('result_22 warns on non-signaling rather than failing', () => {
    const { benchmark, doc } = fixture(22);
    const result = verify.verifyNonlocalGame(benchmark, doc, {});

    assert.equal(result.valid, true);
    assert.equal(result.verification.status, 'verified');
    assert.equal(result.verification.ranked, true);
    assert.equal(checkStatus(result.verification, 'NON_SIGNALING'), 'warn');
    assert.ok(codesOf(result.warnings).includes('NON_SIGNALING_VIOLATION'));

    // The p-value alone is not a usable signal on separately executed circuits: this Ankaa-3 run
    // reaches p ~ 1e-195 with a total-variation distance of about 0.28.
    assert.ok(result.verification.nonSignaling.pValue < 1e-100);
    assert.ok(result.verification.nonSignaling.maxTvd > 0.25);
    assert.ok(result.verification.nonSignaling.minExpected > 5);
});

test('the non-signaling error path exists but ships disabled', () => {
    const { benchmark, doc } = fixture(22);

    // Both halves of the trigger are met, and the default still warns.
    assert.equal(
        checkStatus(verify.verifyNonlocalGame(benchmark, doc, {}).verification, 'NON_SIGNALING'),
        'warn'
    );
    assert.equal(
        checkStatus(
            verify.verifyNonlocalGame(benchmark, doc, { nonSignalingError: 'true' }).verification,
            'NON_SIGNALING'
        ),
        'warn'
    );

    const enabled = verify.verifyNonlocalGame(benchmark, doc, { nonSignalingError: true });
    assert.equal(checkStatus(enabled.verification, 'NON_SIGNALING'), 'fail');
    assert.equal(enabled.valid, false);

    // Raising the effect-size threshold above the observed effect disarms it again, even enabled,
    // because a small p-value on its own must never fail a submission.
    const lenient = verify.verifyNonlocalGame(benchmark, doc,
        { nonSignalingError: true, maxTvd: 0.9 });
    assert.equal(checkStatus(lenient.verification, 'NON_SIGNALING'), 'warn');
    assert.equal(lenient.valid, true);
});

/* ------------------------------------------------------------------ *
 * Display value tolerance
 * ------------------------------------------------------------------ */

test('decimalPlaces reads the written precision, including exponential forms', () => {
    assert.equal(verify.decimalPlaces(0.94), 2);
    assert.equal(verify.decimalPlaces(0.806), 3);
    assert.equal(verify.decimalPlaces(1), 0);
    assert.equal(verify.decimalPlaces(0.935882), 6);
    assert.equal(verify.decimalPlaces(0.9358823529411764), 16);
    assert.equal(verify.decimalPlaces(5e-7), 7);
    assert.equal(verify.decimalPlaces(1.5e-7), 8);
});

test('displayTolerance allows half a unit in the last written place', () => {
    assert.equal(verify.displayTolerance(0.94), 0.005);
    assert.equal(verify.displayTolerance(0.806), 0.0005);
    assert.equal(verify.displayTolerance(0.9), 0.05);
    // Floored, so a full-precision display value is not held below double resolution.
    assert.equal(verify.displayTolerance(0.9358823529411764), 1e-9);
});

test('a rounded metricValue passes and a wrong one fails', () => {
    // 88 questions at 1024 shots, 30 of them winning one extra shot, giving a mean of about
    // 0.93588: the same shape as the published entries that claim 0.94 where the data gives
    // 0.935882.
    const doc = syntheticG14(1024, (index) => (index < 30 ? 959 : 958));
    const game = registry.getGame('g14');
    const rates = counts.computeWinRates(counts.normalizeCounts(doc, game));
    assert.ok(Math.abs(rates.winRateMean - 0.935882) < 1e-5);

    const base = {
        metricName: 'Win Rate',
        nonlocalGame: {
            game: 'g14',
            winRate: rates.winRateMean,
            shotsPerCircuit: 1024,
            countsFile: 'counts.json'
        }
    };

    const rounded = verify.verifyNonlocalGame(
        Object.assign({}, base, { metricValue: 0.94 }), doc, {});
    assert.equal(rounded.valid, true, 'a display value of 0.94 is within half a unit of 0.93588');
    assert.equal(rounded.verification.ranked, true);

    const wrong = verify.verifyNonlocalGame(
        Object.assign({}, base, { metricValue: 0.99 }), doc, {});
    assert.equal(wrong.valid, false);
    assert.ok(codesOf(wrong.errors).includes('METRIC_VALUE_MISMATCH'));
    assert.equal(checkStatus(wrong.verification, 'WIN_RATE'), 'fail');
});

/* ------------------------------------------------------------------ *
 * Shot counts
 * ------------------------------------------------------------------ */

test('a declared shotsPerCircuit that contradicts the counts is an error', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    benchmark.nonlocalGame.shotsPerCircuit = 2048;

    const result = verify.verifyNonlocalGame(benchmark, doc, {});
    assert.equal(result.valid, false);
    assert.ok(codesOf(result.errors).includes('SHOTS_DECLARED_MISMATCH'));
});

test('allowVariableShots downgrades the mismatch and marks the interval approximate', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const table = {};
    game.questions.forEach((question, index) => {
        const shots = 1000 + index;
        const winningKey = question.x === question.y ? '0:0' : '0:1';
        const losingKey = question.x === question.y ? '0:1' : '0:0';
        const answers = {};
        answers[winningKey] = shots - 100;
        answers[losingKey] = 100;
        table[question.key] = answers;
    });
    const doc = { schemaVersion: 1, counts: table };
    const rates = counts.computeWinRates(counts.normalizeCounts(doc, game));

    const benchmark = {
        metricName: 'Win Rate',
        metricValue: 0.9,
        nonlocalGame: {
            game: 'odd-cycle',
            params: { n: 3 },
            winRate: rates.winRateMean,
            shotsPerCircuit: 1002,
            countsFile: 'counts.json'
        }
    };

    const strict = verify.verifyNonlocalGame(benchmark, doc, {});
    assert.equal(strict.valid, false);
    assert.ok(codesOf(strict.errors).includes('SHOTS_MISMATCH'));
    assert.equal(strict.verification.uncertainty.approximate, false);

    // Both spellings of the escape hatch work: an option, or the field on the submission.
    [
        verify.verifyNonlocalGame(benchmark, doc, { allowVariableShots: true }),
        verify.verifyNonlocalGame(
            Object.assign({}, benchmark, {
                nonlocalGame: Object.assign({}, benchmark.nonlocalGame, { allowVariableShots: true })
            }), doc, {})
    ].forEach((lenient) => {
        assert.equal(lenient.valid, true);
        assert.ok(codesOf(lenient.warnings).includes('SHOTS_MISMATCH'));
        assert.equal(lenient.verification.uncertainty.approximate, true);
        assert.equal(lenient.verification.winRate.shotsPerCircuit, null);
        assert.equal(lenient.verification.winRate.shotsMin, 1000);
        assert.equal(lenient.verification.winRate.shotsMax, 1005);
    });
});

/* ------------------------------------------------------------------ *
 * Uncertainty, classical exceedance and the quantum bound
 * ------------------------------------------------------------------ */

test('an absent uncertainty claim is reported, not rejected', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const claimed = benchmark.nonlocalGame.uncertainty;
    delete benchmark.nonlocalGame.uncertainty;

    const result = verify.verifyNonlocalGame(benchmark, doc, {});
    assert.equal(result.valid, true);
    assert.equal(checkStatus(result.verification, 'UNCERTAINTY'), 'pass');
    assert.equal(result.verification.uncertainty.claimed, null);
    assert.equal(result.verification.uncertainty.recomputed, claimed);
});

test('a wrong uncertainty claim fails', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    benchmark.nonlocalGame.uncertainty = 0.02;

    const result = verify.verifyNonlocalGame(benchmark, doc, {});
    assert.equal(result.valid, false);
    assert.ok(codesOf(result.errors).includes('UNCERTAINTY_MISMATCH'));
});

test('classical exceedance reports a z-score and the Bernstein bound separately', () => {
    const doc = syntheticG14(1024, () => 1020);
    const game = registry.getGame('g14');
    const rates = counts.computeWinRates(counts.normalizeCounts(doc, game));

    const result = verify.verifyNonlocalGame({
        metricName: 'Win Rate',
        metricValue: rates.winRateMean,
        nonlocalGame: {
            game: 'g14',
            winRate: rates.winRateMean,
            shotsPerCircuit: 1024,
            countsFile: 'counts.json'
        }
    }, doc, {});

    assert.equal(result.valid, true);
    assert.equal(result.verification.classical.value, 43 / 44);
    assert.equal(result.verification.classical.exceeded, true);

    // `sigma` is the Gaussian-equivalent z-score against the binomial standard error of the
    // pooled rate, which is NOT the Bernstein tail bound reported as `classical.pValue`.
    const pooled = rates.winRatePooled;
    const standardError = Math.sqrt(pooled * (1 - pooled) / rates.totalShots);
    assert.equal(result.verification.classical.sigma,
        (rates.winRateMean - 43 / 44) / standardError);
    assert.ok(result.verification.classical.pValue < 1e-6);
    assert.notEqual(result.verification.classical.sigma, result.verification.classical.pValue);
});

test('a win rate at the quantum value of 1 passes the superquantum check', () => {
    const doc = syntheticG14(1024, () => 1024);
    const game = registry.getGame('g14');
    const rates = counts.computeWinRates(counts.normalizeCounts(doc, game));
    assert.equal(rates.winRateMean, 1);

    const result = verify.verifyNonlocalGame({
        metricName: 'Win Rate',
        metricValue: 1,
        nonlocalGame: {
            game: 'g14',
            winRate: 1,
            shotsPerCircuit: 1024,
            countsFile: 'counts.json'
        }
    }, doc, {});

    assert.equal(checkStatus(result.verification, 'SUPERQUANTUM'), 'pass');
    assert.equal(result.verification.game.quantumValue, 1);
});

test('a null quantum value degrades the check to "not above 1" and says so', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const result = verify.verifyNonlocalGame(benchmark, doc, {});

    assert.equal(result.verification.game.quantumValue, null);
    const check = result.verification.checks.find((entry) => entry.id === 'SUPERQUANTUM');
    assert.equal(check.status, 'pass');
    assert.match(check.message, /pins no quantum value/);
    assert.match(check.message, /not above 1/);
});

/* ------------------------------------------------------------------ *
 * Untrusted input
 * ------------------------------------------------------------------ */

test('a forged verification block on the submission is ignored', () => {
    const one = fixture(1);
    one.benchmark.verification = {
        verifierVersion: 99,
        status: 'verified',
        ranked: true,
        countsSha256: 'deadbeef',
        checks: [{ id: 'WIN_RATE', status: 'pass', message: 'trust me' }]
    };

    const result = verify.verifyNonlocalGame(one.benchmark, one.doc, { rawCounts: 'abc' });

    assert.equal(result.verification.status, 'failed');
    assert.equal(result.verification.ranked, false);
    assert.equal(result.verification.verifierVersion, verify.VERIFIER_VERSION);
    assert.equal(result.verification.countsSha256, verify.sha256Hex('abc'));
    assert.notEqual(result.verification.countsSha256, 'deadbeef');
    assert.equal(result.verification.checks.length, 5);
    assert.equal(checkStatus(result.verification, 'WIN_RATE'), 'fail');
});

test('a forged verification block cannot rank a correct submission on its own terms', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    benchmark.verification = { status: 'verified', ranked: true, countsSha256: 'deadbeef' };

    const result = verify.verifyNonlocalGame(benchmark, doc, {});
    assert.equal(result.verification.ranked, true, 'this submission genuinely is correct');
    // The block is computed, not copied: it has the full shape and a real digest field.
    assert.notEqual(result.verification, benchmark.verification);
    assert.equal(result.verification.countsSha256, null);
    assert.equal(result.verification.verifierVersion, verify.VERIFIER_VERSION);
});

test('an unknown game name is a structural failure, not a crash', () => {
    ['nope', '__proto__', 'constructor', 'toString', 42, null].forEach((name) => {
        const result = verify.verifyNonlocalGame({
            metricValue: 0.5,
            nonlocalGame: { game: name, winRate: 0.5, shotsPerCircuit: 1, countsFile: 'c.json' }
        }, { schemaVersion: 1, counts: {} }, {});

        assert.equal(result.valid, false);
        assert.equal(result.verification.status, 'failed');
        assert.equal(result.errors[0].code, 'UNKNOWN_GAME');
    });
});

test('bad game parameters are a structural failure', () => {
    const result = verify.verifyNonlocalGame({
        metricValue: 0.5,
        nonlocalGame: {
            game: 'odd-cycle',
            params: { n: 4 },
            winRate: 0.5,
            shotsPerCircuit: 1,
            countsFile: 'c.json'
        }
    }, { schemaVersion: 1, counts: {} }, {});

    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'BAD_PARAM');
});

test('a submission with no nonlocalGame block is unverified rather than failed', () => {
    const result = verify.verifyNonlocalGame({ metricValue: 0.5 }, null, {});
    assert.equal(result.valid, false);
    assert.equal(result.verification.status, 'unverified');
    assert.equal(result.verification.ranked, false);
    assert.equal(result.errors[0].code, 'NO_NONLOCAL_GAME');
});

test('the verification block is plain and serializable', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const result = verify.verifyNonlocalGame(benchmark, doc, { rawCounts: 'bytes' });
    const block = result.verification;

    assert.deepEqual(JSON.parse(JSON.stringify(block)), block);
    assert.deepEqual(Object.keys(block).sort(), [
        'checks', 'classical', 'countsSha256', 'game', 'nonSignaling', 'ranked', 'schemaVersion',
        'status', 'uncertainty', 'verifierVersion', 'winRate'
    ]);
    assert.deepEqual(Object.keys(block.game).sort(), [
        'classicalValue', 'family', 'id', 'label', 'name', 'params', 'quantumValue', 'questions'
    ]);
    assert.deepEqual(block.game.params, { n: 3 });
    assert.equal(Object.isFrozen(block.game.params), false, 'params must be a plain copy');
    assert.equal(block.schemaVersion, 1);
    assert.equal(block.countsSha256, verify.sha256Hex('bytes'));
    assert.equal(block.checks.length, 5);
});
