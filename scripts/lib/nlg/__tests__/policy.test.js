/**
 * Verification policy and index wiring.
 *
 * Two things are pinned here.
 *
 * 1. How the effective policy is resolved: environment over file, file over default, and a default
 *    of `report` whenever the file is missing, unreadable, malformed or names something unknown. A
 *    policy file is never a reason to crash a build.
 * 2. That the mode decides only whether the build fails. A `report` run still recomputes every
 *    claim and still writes the failure into the index as unverified and unranked, and a forged
 *    `verification` block never survives into the output under either mode.
 *
 * The index runs are driven against a corpus built under the OS temp directory, so nothing is
 * written inside `submissions/` or `public/`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'submissions', 'template');

// Module specifiers stay plain string literals here: the source scan in `registry.test.js` walks
// every file under `scripts/lib/nlg/`, this one included, and rejects a non-literal module path.
const GENERATOR_PATH = require.resolve('../../../generate-benchmark-index');

const generateBenchmarkIndex = require('../../../generate-benchmark-index');
const { checkDuplicates } = require('../../../validate-benchmark');
const resolvePolicy = generateBenchmarkIndex.resolvePolicy;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Run a function with `QDB_VERIFY` set to a value, restoring the environment afterwards.
 *
 * @param {string|undefined} value - Value to set, or `undefined` to unset the variable.
 * @param {Function} fn - Body to run.
 * @returns {*} Whatever the body returns.
 */
function withEnv(value, fn) {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'QDB_VERIFY');
    const previous = process.env.QDB_VERIFY;
    try {
        if (value === undefined) {
            delete process.env.QDB_VERIFY;
        } else {
            process.env.QDB_VERIFY = value;
        }
        return fn();
    } finally {
        if (had) {
            process.env.QDB_VERIFY = previous;
        } else {
            delete process.env.QDB_VERIFY;
        }
    }
}

/**
 * Run a function with the console silenced, so a generator run does not bury the test output.
 *
 * @param {Function} fn - Body to run.
 * @returns {*} Whatever the body returns.
 */
function quiet(fn) {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = function noop() {};
    console.warn = function noop() {};
    console.error = function noop() {};
    try {
        return fn();
    } finally {
        console.log = saved.log;
        console.warn = saved.warn;
        console.error = saved.error;
    }
}

/**
 * Write a policy file into a fresh temporary directory.
 *
 * @param {string} contents - Raw file contents.
 * @returns {{dir: string, file: string}} The directory and the policy file inside it.
 */
function writePolicy(contents) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-policy-'));
    const file = path.join(dir, 'verification-policy.json');
    fs.writeFileSync(file, contents);
    return { dir: dir, file: file };
}

/**
 * @param {string} dir - Directory to remove.
 * @returns {void}
 */
function cleanup(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Build an empty temporary corpus: a submissions folder plus a path to write the index to.
 *
 * @returns {{root: string, submissionsDir: string, outputFile: string}} The corpus.
 */
function makeCorpus() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-index-'));
    const submissionsDir = path.join(root, 'submissions');
    fs.mkdirSync(submissionsDir);
    return {
        root: root,
        submissionsDir: submissionsDir,
        outputFile: path.join(root, 'benchmarks.json')
    };
}

/**
 * Add one submission folder to a corpus.
 *
 * @param {Object} corpus - From `makeCorpus`.
 * @param {string} name - Folder name.
 * @param {Object} benchmark - Benchmark document.
 * @param {Object|null} [counts] - Counts document, written as `counts.json` when given.
 * @returns {string} The folder path.
 */
function addSubmission(corpus, name, benchmark, counts) {
    const folder = path.join(corpus.submissionsDir, name);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
    if (counts) {
        fs.writeFileSync(path.join(folder, 'counts.json'), JSON.stringify(counts, null, 2));
    }
    return folder;
}

/**
 * The shipped template, which is a complete, self-consistent nonlocal-game submission.
 *
 * @returns {{benchmark: Object, counts: Object}} Fresh parsed copies.
 */
function templateSubmission() {
    return {
        benchmark: JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'benchmark.json'), 'utf8')),
        counts: JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'counts.json'), 'utf8'))
    };
}

/**
 * @param {Object} corpus - From `makeCorpus`.
 * @returns {Array} The written index.
 */
function readIndex(corpus) {
    return JSON.parse(fs.readFileSync(corpus.outputFile, 'utf8'));
}

/* ------------------------------------------------------------------ *
 * Policy resolution
 * ------------------------------------------------------------------ */

test('policy file naming enforce resolves to enforce', () => {
    const policy = writePolicy('{"mode": "enforce"}');
    try {
        withEnv(undefined, () => {
            const resolved = resolvePolicy(policy.file);
            assert.equal(resolved.mode, 'enforce');
            assert.equal(resolved.source, policy.file);
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('policy file naming report resolves to report', () => {
    const policy = writePolicy('{"mode": "report"}');
    try {
        withEnv(undefined, () => {
            assert.equal(resolvePolicy(policy.file).mode, 'report');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('a missing policy file falls back to report', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-policy-'));
    try {
        withEnv(undefined, () => {
            const resolved = resolvePolicy(path.join(dir, 'does-not-exist.json'));
            assert.equal(resolved.mode, 'report');
        });
    } finally {
        cleanup(dir);
    }
});

test('a malformed policy file falls back to report instead of crashing', () => {
    const policy = writePolicy('{ this is not json');
    try {
        withEnv(undefined, () => {
            assert.equal(quiet(() => resolvePolicy(policy.file)).mode, 'report');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('an unknown mode string falls back to report', () => {
    const policy = writePolicy('{"mode": "strict"}');
    try {
        withEnv(undefined, () => {
            assert.equal(quiet(() => resolvePolicy(policy.file)).mode, 'report');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('a non-string mode falls back to report', () => {
    const policy = writePolicy('{"mode": 1}');
    try {
        withEnv(undefined, () => {
            assert.equal(quiet(() => resolvePolicy(policy.file)).mode, 'report');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('QDB_VERIFY overrides the file in both directions', () => {
    const reportFile = writePolicy('{"mode": "report"}');
    const enforceFile = writePolicy('{"mode": "enforce"}');
    try {
        withEnv('enforce', () => {
            const resolved = resolvePolicy(reportFile.file);
            assert.equal(resolved.mode, 'enforce');
            assert.equal(resolved.source, 'QDB_VERIFY');
        });
        withEnv('report', () => {
            const resolved = resolvePolicy(enforceFile.file);
            assert.equal(resolved.mode, 'report');
            assert.equal(resolved.source, 'QDB_VERIFY');
        });
    } finally {
        cleanup(reportFile.dir);
        cleanup(enforceFile.dir);
    }
});

test('QDB_VERIFY is case-insensitive and trimmed', () => {
    const policy = writePolicy('{"mode": "report"}');
    try {
        withEnv('ENFORCE', () => {
            assert.equal(resolvePolicy(policy.file).mode, 'enforce');
        });
        withEnv('  Enforce  ', () => {
            assert.equal(resolvePolicy(policy.file).mode, 'enforce');
        });
        withEnv('RePoRt', () => {
            assert.equal(resolvePolicy(policy.file).mode, 'report');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('junk in QDB_VERIFY falls back to the file rather than to enforce', () => {
    const policy = writePolicy('{"mode": "enforce"}');
    try {
        withEnv('yes-please', () => {
            assert.equal(quiet(() => resolvePolicy(policy.file)).mode, 'enforce');
        });
        withEnv('', () => {
            assert.equal(quiet(() => resolvePolicy(policy.file)).mode, 'enforce');
        });
    } finally {
        cleanup(policy.dir);
    }
});

test('an unset QDB_VERIFY leaves the environment untouched after resolution', () => {
    const policy = writePolicy('{"mode": "report"}');
    try {
        withEnv(undefined, () => {
            resolvePolicy(policy.file);
            assert.equal(Object.prototype.hasOwnProperty.call(process.env, 'QDB_VERIFY'), false);
        });
    } finally {
        cleanup(policy.dir);
    }
});

test("the repository's own policy file resolves", () => {
    withEnv(undefined, () => {
        const resolved = resolvePolicy();
        assert.ok(resolved.mode === 'report' || resolved.mode === 'enforce');
    });
});

/* ------------------------------------------------------------------ *
 * The mode controls only whether the build fails
 * ------------------------------------------------------------------ */

test('report mode still recomputes a full verification block', () => {
    const corpus = makeCorpus();
    try {
        const template = templateSubmission();
        addSubmission(corpus, 'good_run', template.benchmark, template.counts);

        const result = withEnv('report', () => quiet(() => generateBenchmarkIndex({
            submissionsDir: corpus.submissionsDir,
            outputFile: corpus.outputFile
        })));

        assert.equal(result.length, 1);
        const written = readIndex(corpus);
        assert.equal(written.length, 1);

        const verification = written[0].verification;
        assert.ok(verification, 'report mode must still attach a computed verification block');
        assert.equal(verification.status, 'verified');
        assert.equal(verification.ranked, true);
        assert.equal(typeof verification.verifierVersion, 'number');
        assert.equal(verification.game.name, 'odd-cycle');
        assert.equal(verification.winRate.questions, 6);
        assert.equal(verification.winRate.shotsPerCircuit, 1024);
        assert.equal(verification.winRate.recomputedMean, template.benchmark.nonlocalGame.winRate);
        assert.match(verification.countsSha256, /^[0-9a-f]{64}$/);

        const ids = verification.checks.map(check => check.id);
        assert.deepEqual(ids.slice().sort(),
            ['NON_SIGNALING', 'STRUCTURE', 'SUPERQUANTUM', 'UNCERTAINTY', 'WIN_RATE']);
    } finally {
        cleanup(corpus.root);
    }
});

test('report mode writes a failing entry as unverified and unranked, and exits cleanly', () => {
    const corpus = makeCorpus();
    try {
        const template = templateSubmission();
        template.benchmark.nonlocalGame.winRate = 0.5;
        addSubmission(corpus, 'bad_run', template.benchmark, template.counts);

        const result = withEnv('report', () => quiet(() => generateBenchmarkIndex({
            submissionsDir: corpus.submissionsDir,
            outputFile: corpus.outputFile
        })));

        assert.equal(result.length, 1);
        const written = readIndex(corpus);
        assert.equal(written.length, 1, 'a failing entry is published, not silently dropped');

        const verification = written[0].verification;
        assert.equal(verification.status, 'failed');
        assert.equal(verification.ranked, false);
        assert.equal(verification.winRate.claimed, 0.5);
        assert.ok(verification.winRate.recomputedMean > 0.8);

        const winRateCheck = verification.checks.find(check => check.id === 'WIN_RATE');
        assert.equal(winRateCheck.status, 'fail');
    } finally {
        cleanup(corpus.root);
    }
});

test('enforce mode throws before writing, leaving the previous index untouched', () => {
    const corpus = makeCorpus();
    try {
        const template = templateSubmission();
        template.benchmark.nonlocalGame.winRate = 0.5;
        addSubmission(corpus, 'bad_run', template.benchmark, template.counts);

        const sentinel = '[{"id":"previous good artifact"}]';
        fs.writeFileSync(corpus.outputFile, sentinel);

        assert.throws(
            () => withEnv('enforce', () => quiet(() => generateBenchmarkIndex({
                submissionsDir: corpus.submissionsDir,
                outputFile: corpus.outputFile
            }))),
            /bad_run/
        );

        assert.equal(fs.readFileSync(corpus.outputFile, 'utf8'), sentinel,
            'a rejected build must leave the previous index byte-identical on disk');
    } finally {
        cleanup(corpus.root);
    }
});

test('enforce mode writes the index when every claim reproduces', () => {
    const corpus = makeCorpus();
    try {
        const template = templateSubmission();
        addSubmission(corpus, 'good_run', template.benchmark, template.counts);

        const result = withEnv('enforce', () => quiet(() => generateBenchmarkIndex({
            submissionsDir: corpus.submissionsDir,
            outputFile: corpus.outputFile
        })));

        assert.equal(result.length, 1);
        assert.equal(readIndex(corpus)[0].verification.status, 'verified');
    } finally {
        cleanup(corpus.root);
    }
});

/* ------------------------------------------------------------------ *
 * A forged verification block never survives
 * ------------------------------------------------------------------ */

test('a submitted verification block is rejected by the schema', () => {
    const corpus = makeCorpus();
    try {
        const template = templateSubmission();
        template.benchmark.verification = { status: 'verified', ranked: true };
        addSubmission(corpus, 'forged', template.benchmark, template.counts);

        const result = withEnv('report', () => quiet(() => generateBenchmarkIndex({
            submissionsDir: corpus.submissionsDir,
            outputFile: corpus.outputFile
        })));

        assert.equal(result.length, 0, 'a document carrying `verification` fails validation');
        assert.equal(readIndex(corpus).length, 0);
    } finally {
        cleanup(corpus.root);
    }
});

test('the generator destroys a forged verification block even if validation lets it through', () => {
    const corpus = makeCorpus();
    const validator = require('../../../validate-benchmark');
    const realValidate = validator.validateBenchmarkFile;

    // Stand in for a validation layer that has been loosened, reordered or skipped, so the
    // generator's own delete is what is under test rather than the schema's rejection.
    validator.validateBenchmarkFile = function permissive(benchmarkPath) {
        return {
            valid: true,
            errors: [],
            warnings: [],
            data: JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'))
        };
    };
    delete require.cache[GENERATOR_PATH];
    const patchedGenerator = require('../../../generate-benchmark-index');

    try {
        const forgery = { status: 'verified', ranked: true, forgedMarker: 'trust me' };

        const template = templateSubmission();
        template.benchmark.verification = forgery;
        addSubmission(corpus, 'forged_with_counts', template.benchmark, template.counts);

        addSubmission(corpus, 'forged_no_counts', {
            algorithmName: 'Forged Claim',
            device: 'Nowhere In Particular',
            metricName: 'Win Rate',
            metricValue: 0.99,
            timestamp: '2026-01-01T00:00:00.000Z',
            verification: forgery
        }, null);

        withEnv('report', () => quiet(() => patchedGenerator({
            submissionsDir: corpus.submissionsDir,
            outputFile: corpus.outputFile
        })));

        const written = readIndex(corpus);
        assert.equal(written.length, 2);

        const withoutCounts = written.find(entry => entry.benchmarkFolder === 'forged_no_counts');
        assert.equal(Object.prototype.hasOwnProperty.call(withoutCounts, 'verification'), false,
            'an entry with nothing to recompute must carry no verification block at all');

        const withCounts = written.find(entry => entry.benchmarkFolder === 'forged_with_counts');
        assert.equal(withCounts.verification.forgedMarker, undefined);
        assert.equal(typeof withCounts.verification.verifierVersion, 'number');
        assert.equal(withCounts.verification.status, 'verified');
        assert.ok(Array.isArray(withCounts.verification.checks));

        assert.equal(JSON.stringify(written).indexOf('forgedMarker'), -1,
            'no trace of the forged block may reach the index');
    } finally {
        validator.validateBenchmarkFile = realValidate;
        delete require.cache[GENERATOR_PATH];
        require('../../../generate-benchmark-index');
        cleanup(corpus.root);
    }
});

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

test('duplicate detection is unchanged for entries without a nonlocalGame block', () => {
    const base = { algorithmName: 'A', device: 'D', metricName: 'Win Rate' };
    const similar = checkDuplicates([
        Object.assign({ id: 'one', metricValue: 0.9 }, base),
        Object.assign({ id: 'two', metricValue: 0.90000001 }, base)
    ]);
    assert.equal(similar.length, 1);
    assert.equal(similar[0].current, 'two');

    const different = checkDuplicates([
        Object.assign({ id: 'one', metricValue: 0.9 }, base),
        Object.assign({ id: 'two', metricValue: 0.8 }, base)
    ]);
    assert.equal(different.length, 0);
});

test('nonlocal-game entries are keyed on team, game, params and run, not on the value', () => {
    /**
     * @param {string} id - Submission id.
     * @param {string} team - Event team.
     * @param {number} value - Reported win rate.
     * @param {string} date - Experiment date, standing in for the run.
     * @returns {Object} A benchmark document.
     */
    function entry(id, team, value, date) {
        return {
            id: id,
            algorithmName: 'Odd Cycle C3 (Nonlocal Game)',
            device: 'Example Backend',
            metricName: 'Win Rate',
            metricValue: value,
            experimentDate: date,
            nonlocalGame: { game: 'odd-cycle', params: { n: 3 }, eventTeam: team, winRate: value }
        };
    }

    // Two teams landing on the same number on the same game is not a duplicate.
    assert.deepEqual(checkDuplicates([
        entry('a', 'Team One', 0.806, '2026-08-22T10:00:00.000Z'),
        entry('b', 'Team Two', 0.806, '2026-08-22T10:00:00.000Z')
    ]), []);

    // Nor is the same team submitting a second run.
    assert.deepEqual(checkDuplicates([
        entry('a', 'Team One', 0.806, '2026-08-22T10:00:00.000Z'),
        entry('b', 'Team One', 0.806, '2026-08-22T14:00:00.000Z')
    ]), []);

    // The same team, game, params and run twice is, whatever the values say.
    const resubmitted = checkDuplicates([
        entry('a', 'Team One', 0.806, '2026-08-22T10:00:00.000Z'),
        entry('b', 'Team One', 0.42, '2026-08-22T10:00:00.000Z')
    ]);
    assert.equal(resubmitted.length, 1);
    assert.equal(resubmitted[0].current, 'b');
    assert.equal(resubmitted[0].existing, 'a');
});
