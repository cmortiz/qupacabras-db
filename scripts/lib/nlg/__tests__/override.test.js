/**
 * Tests for `verify-override.json`, the committed file by which a named maintainer accepts a named
 * verification failure.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/*.test.js` (unquoted, so the shell expands the
 * glob). Module specifiers stay plain string literals: the source scan in `registry.test.js` walks
 * every file under `scripts/lib/nlg/`, this one included, and rejects a non-literal module path.
 *
 * Three properties are what these tests exist for.
 *
 * 1. An override suppresses only while its `countsSha256` equals the digest of the counts file on
 *    disk. That is what stops laundering: get an override approved for benign counts, swap in the
 *    numbers you wanted, and the digest goes stale and the failure comes back. The stale case is
 *    asserted twice, once against `verifySubmissionFolder` and once through a real index build
 *    under `QDB_VERIFY=enforce`, which must still throw.
 * 2. A malformed override suppresses nothing and crashes nothing. Every way of writing the file
 *    wrong produces its own warning saying it was ignored and why.
 * 3. An applied override never reads as `verified` and never ranks. The entry is published as
 *    `overridden`, carrying the approver, the pull request, the reason and the accepted digest.
 *
 * Fixtures are built under `os.tmpdir()` and removed afterwards. Nothing is written inside
 * `submissions/` or `public/`. Every file is read inside a test body, never at module load time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const io = require('../io');
const generateBenchmarkIndex = require('../../../generate-benchmark-index');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'submissions', 'template');

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * @returns {Object} A fresh parsed copy of the shipped template benchmark.
 */
function templateBenchmark() {
    return JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'benchmark.json'), 'utf8'));
}

/**
 * The template counts file as raw text.
 *
 * The raw bytes are used rather than a re-serialization, so a digest taken here is the same one
 * `shasum -a 256` reports for the file a maintainer would be looking at.
 *
 * @returns {string} File contents.
 */
function templateCountsText() {
    return fs.readFileSync(path.join(TEMPLATE_DIR, 'counts.json'), 'utf8');
}

/**
 * @param {string} folder - Directory to remove.
 * @returns {void}
 */
function remove(folder) {
    fs.rmSync(folder, { recursive: true, force: true });
}

/**
 * A throwaway submission folder holding the template, optionally with a broken claim.
 *
 * @param {Object} [options] - Fixture options.
 * @param {number} [options.winRate] - Claim to write instead of the template's, to force a
 *   WIN_RATE failure.
 * @param {boolean} [options.omitCounts] - Leave the counts file out entirely.
 * @returns {{folder: string, benchmark: Object, countsSha256: string}} The fixture.
 */
function makeSubmission(options) {
    const settings = options || {};
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-override-'));
    const benchmark = templateBenchmark();
    if (typeof settings.winRate === 'number') {
        benchmark.nonlocalGame.winRate = settings.winRate;
    }
    fs.writeFileSync(path.join(folder, 'benchmark.json'), JSON.stringify(benchmark, null, 2));

    const counts = templateCountsText();
    if (settings.omitCounts !== true) {
        fs.writeFileSync(path.join(folder, 'counts.json'), counts);
    }
    return { folder: folder, benchmark: benchmark, countsSha256: io.sha256Hex(counts) };
}

/**
 * @param {string} folder - Submission folder.
 * @param {Object|string} contents - Override document, or raw text to write verbatim.
 * @returns {void}
 */
function writeOverride(folder, contents) {
    const text = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2);
    fs.writeFileSync(path.join(folder, 'verify-override.json'), text);
}

/**
 * @param {string} sha - Digest the override approves.
 * @returns {Object} A well-formed override document.
 */
function validOverride(sha) {
    return {
        reason: 'Counts exported before the shot counter was fixed; the run is genuine.',
        approvedBy: 'maintainer-handle',
        approvedAt: '2026-08-22T14:31:00Z',
        pr: 128,
        countsSha256: sha
    };
}

/**
 * @param {Object} result - A verification result.
 * @param {string} code - Code to look for.
 * @returns {Object|undefined} The first warning carrying that code.
 */
function warningWithCode(result, code) {
    return result.warnings.find(function match(warning) {
        return warning.code === code;
    });
}

/* ------------------------------------------------------------------ *
 * Corpus fixtures for real index builds
 * ------------------------------------------------------------------ */

/**
 * Run a function with `QDB_VERIFY` set, restoring the environment afterwards.
 *
 * @param {string|undefined} value - Value to set, or `undefined` to unset.
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
 * A temporary corpus the index generator can be pointed at.
 *
 * @returns {{root: string, submissionsDir: string, outputFile: string}} The corpus.
 */
function makeCorpus() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-override-index-'));
    const submissionsDir = path.join(root, 'submissions');
    fs.mkdirSync(submissionsDir);
    return {
        root: root,
        submissionsDir: submissionsDir,
        outputFile: path.join(root, 'benchmarks.json')
    };
}

/**
 * Add one template-derived submission to a corpus.
 *
 * @param {Object} corpus - From `makeCorpus`.
 * @param {string} name - Folder name.
 * @param {number} [winRate] - Claim to write instead of the template's.
 * @returns {{folder: string, countsSha256: string}} The folder and the digest of its counts.
 */
function addSubmission(corpus, name, winRate) {
    const folder = path.join(corpus.submissionsDir, name);
    fs.mkdirSync(folder);
    const benchmark = templateBenchmark();
    if (typeof winRate === 'number') {
        benchmark.nonlocalGame.winRate = winRate;
    }
    fs.writeFileSync(path.join(folder, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
    const counts = templateCountsText();
    fs.writeFileSync(path.join(folder, 'counts.json'), counts);
    return { folder: folder, countsSha256: io.sha256Hex(counts) };
}

/**
 * @param {Object} corpus - From `makeCorpus`.
 * @param {string} mode - Policy mode to run under.
 * @returns {Array} The written index.
 */
function build(corpus, mode) {
    withEnv(mode, function run() {
        return quiet(function generate() {
            return generateBenchmarkIndex({
                submissionsDir: corpus.submissionsDir,
                outputFile: corpus.outputFile
            });
        });
    });
    return JSON.parse(fs.readFileSync(corpus.outputFile, 'utf8'));
}

/* ------------------------------------------------------------------ *
 * The happy path, which is still not a verified result
 * ------------------------------------------------------------------ */

test('a matching override suppresses the failure and publishes the entry unverified', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        assert.equal(result.valid, true, 'a matching override clears the errors');
        assert.deepEqual(result.errors, []);

        const verification = result.verification;
        assert.equal(verification.status, 'overridden');
        assert.notEqual(verification.status, 'verified',
            'an override must never claim the number was verified');
        assert.equal(verification.ranked, false, 'an overridden entry is never ranked');

        const override = verification.override;
        assert.equal(override.applied, true);
        assert.equal(override.status, 'applied');
        assert.equal(override.approvedBy, 'maintainer-handle');
        assert.equal(override.pr, 128);
        assert.equal(override.approvedAt, '2026-08-22T14:31:00Z');
        assert.match(override.reason, /shot counter/);
        assert.equal(override.hashMatched, true);
        assert.equal(override.expectedSha256, submission.countsSha256);
        assert.equal(override.actualSha256, submission.countsSha256);
        assert.equal(override.suppressed.length, 1);
        assert.equal(override.suppressed[0].code, 'WIN_RATE_MISMATCH');
    } finally {
        remove(submission.folder);
    }
});

test('an applied override leaves the failed check visible and warns loudly', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        const winRate = result.verification.checks.find(check => check.id === 'WIN_RATE');
        assert.equal(winRate.status, 'fail', 'the check records what happened, not what was accepted');

        const applied = warningWithCode(result, 'OVERRIDE_APPLIED');
        assert.ok(applied, 'an applied override warns');
        assert.match(applied.message, /maintainer-handle/);
        assert.match(applied.message, /unverified and unranked/);

        const suppressed = warningWithCode(result, 'WIN_RATE_MISMATCH');
        assert.ok(suppressed, 'the suppressed error survives as a warning under its own code');
        assert.match(suppressed.message, /^suppressed by verify-override\.json/);
        assert.equal(suppressed.field, 'nonlocalGame.winRate');
    } finally {
        remove(submission.folder);
    }
});

/* ------------------------------------------------------------------ *
 * Staleness, which is the entire security property
 * ------------------------------------------------------------------ */

test('an override for different counts does not suppress', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        const stale = 'a'.repeat(64);
        writeOverride(submission.folder, validOverride(stale));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].code, 'WIN_RATE_MISMATCH');
        assert.equal(result.verification.status, 'failed');
        assert.equal(result.verification.ranked, false);

        const override = result.verification.override;
        assert.equal(override.applied, false);
        assert.equal(override.status, 'stale');
        assert.equal(override.hashMatched, false);
        assert.equal(override.expectedSha256, stale);
        assert.equal(override.actualSha256, submission.countsSha256,
            'the block records both digests so the discrepancy is readable');

        const warning = warningWithCode(result, 'OVERRIDE_STALE');
        assert.ok(warning);
        assert.match(warning.message, /ignored/);
    } finally {
        remove(submission.folder);
    }
});

test('editing the counts after approval makes the override stop suppressing', () => {
    // The laundering attempt the digest exists to stop: get an override approved, then swap the
    // numbers in behind it.
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const before = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
        assert.equal(before.verification.status, 'overridden');

        const countsPath = path.join(submission.folder, 'counts.json');
        // A change that leaves the parsed value identical is still a change to the approved bytes.
        fs.writeFileSync(countsPath, fs.readFileSync(countsPath, 'utf8') + '\n');

        const after = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
        assert.equal(after.verification.status, 'failed');
        assert.equal(after.verification.override.applied, false);
        assert.equal(after.verification.override.status, 'stale');
        assert.notEqual(after.verification.override.actualSha256,
            after.verification.override.expectedSha256);
        assert.equal(after.valid, false);
    } finally {
        remove(submission.folder);
    }
});

test('an override cannot suppress when the counts file cannot be read', () => {
    const submission = makeSubmission({ omitCounts: true });
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        assert.equal(result.valid, false);
        assert.equal(result.errors[0].code, 'COUNTS_FILE_MISSING');
        assert.equal(result.verification.status, 'failed');
        assert.equal(result.verification.override.applied, false);
        assert.equal(result.verification.override.status, 'stale');
        assert.equal(result.verification.override.actualSha256, null);
        assert.ok(warningWithCode(result, 'OVERRIDE_STALE'));
    } finally {
        remove(submission.folder);
    }
});

/* ------------------------------------------------------------------ *
 * Malformed overrides suppress nothing and crash nothing
 * ------------------------------------------------------------------ */

test('a malformed override is ignored, with its own warning, and never suppresses', () => {
    const good = validOverride('b'.repeat(64));
    const cases = [
        { label: 'not JSON at all', text: '{ "reason": ', code: 'OVERRIDE_INVALID_JSON' },
        { label: 'an empty file', text: '', code: 'OVERRIDE_INVALID_JSON' },
        { label: 'a JSON array', text: '[]', code: 'OVERRIDE_INVALID' },
        { label: 'a JSON string', text: '"approved"', code: 'OVERRIDE_INVALID' },
        { label: 'null', text: 'null', code: 'OVERRIDE_INVALID' },
        { label: 'missing reason', doc: { approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: good.countsSha256 } },
        { label: 'missing approvedBy', doc: { reason: 'r', approvedAt: good.approvedAt, pr: 1, countsSha256: good.countsSha256 } },
        { label: 'missing approvedAt', doc: { reason: 'r', approvedBy: 'a', pr: 1, countsSha256: good.countsSha256 } },
        { label: 'missing pr', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, countsSha256: good.countsSha256 } },
        { label: 'missing countsSha256', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1 } },
        { label: 'an empty reason', doc: { reason: '', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: good.countsSha256 } },
        { label: 'a whitespace reason', doc: { reason: '   ', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: good.countsSha256 } },
        { label: 'an empty approvedBy', doc: { reason: 'r', approvedBy: '', approvedAt: good.approvedAt, pr: 1, countsSha256: good.countsSha256 } },
        { label: 'a non-timestamp approvedAt', doc: { reason: 'r', approvedBy: 'a', approvedAt: 'yesterday', pr: 1, countsSha256: good.countsSha256 } },
        { label: 'an impossible approvedAt', doc: { reason: 'r', approvedBy: 'a', approvedAt: '2026-13-45T00:00:00Z', pr: 1, countsSha256: good.countsSha256 } },
        { label: 'a fractional pr', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 12.5, countsSha256: good.countsSha256 } },
        { label: 'a string pr', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: '128', countsSha256: good.countsSha256 } },
        { label: 'a zero pr', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 0, countsSha256: good.countsSha256 } },
        { label: 'a negative pr', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: -3, countsSha256: good.countsSha256 } },
        { label: 'a short digest', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: 'b'.repeat(63) } },
        { label: 'a long digest', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: 'b'.repeat(65) } },
        { label: 'an uppercase digest', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: 'B'.repeat(64) } },
        { label: 'a non-hex digest', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: 'z'.repeat(64) } },
        { label: 'a digest with whitespace', doc: { reason: 'r', approvedBy: 'a', approvedAt: good.approvedAt, pr: 1, countsSha256: ' ' + 'b'.repeat(63) } }
    ];

    cases.forEach((entry) => {
        const submission = makeSubmission({ winRate: 0.5 });
        try {
            // A malformed override is written against the RIGHT counts, so only its own malformity
            // can be the reason it fails to suppress.
            const contents = entry.text !== undefined
                ? entry.text
                : Object.assign({}, entry.doc, entry.doc.countsSha256 === good.countsSha256
                    ? { countsSha256: submission.countsSha256 }
                    : {});
            writeOverride(submission.folder, contents);

            const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

            assert.equal(result.valid, false, entry.label + ' must not suppress');
            assert.equal(result.verification.status, 'failed', entry.label + ' must not suppress');
            assert.equal(result.verification.ranked, false, entry.label);
            assert.equal(result.verification.override.applied, false, entry.label);

            const expected = entry.code || 'OVERRIDE_INVALID';
            const warning = warningWithCode(result, expected);
            assert.ok(warning, entry.label + ' must warn under ' + expected);
            assert.match(warning.message, /ignored/, entry.label + ' must say it was ignored');
            assert.ok(warning.message.length > 40, entry.label + ' must say why');
        } finally {
            remove(submission.folder);
        }
    });
});

test('a malformed override never throws, whatever is in the file', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        ['', '\0', '{', '[[[', 'undefined', '{"pr": 1e400}', '{"reason": {"toString": 1}}']
            .forEach((text) => {
                writeOverride(submission.folder, text);
                const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
                assert.equal(result.valid, false, JSON.stringify(text));
                assert.equal(result.verification.override.applied, false, JSON.stringify(text));
            });
    } finally {
        remove(submission.folder);
    }
});

/* ------------------------------------------------------------------ *
 * Overrides with nothing to override
 * ------------------------------------------------------------------ */

test('an override on a passing submission is a warning, and the entry stays verified and ranked', () => {
    const submission = makeSubmission();
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        assert.equal(result.valid, true);
        assert.deepEqual(result.errors, []);
        assert.equal(result.verification.status, 'verified');
        assert.equal(result.verification.ranked, true);

        const override = result.verification.override;
        assert.equal(override.applied, false);
        assert.equal(override.status, 'unused');
        assert.equal(override.hashMatched, true);
        assert.deepEqual(override.suppressed, []);

        const warning = warningWithCode(result, 'OVERRIDE_UNUSED');
        assert.ok(warning, 'a dead-weight override warns rather than erroring');
        assert.match(warning.message, /remove it/);
    } finally {
        remove(submission.folder);
    }
});

test('an override on a submission with no nonlocalGame block is ignored with a warning', () => {
    const submission = makeSubmission();
    try {
        writeOverride(submission.folder, validOverride(submission.countsSha256));

        // The gate holds: a benchmark with no claim still reports nothing to verify, and no counts
        // read and no override read happens behind it.
        assert.equal(io.verifySubmissionFolder(submission.folder, { metricValue: 1 }, {}), null);

        // The override itself reports what it is: an approval of a failure that does not exist.
        const record = io.applyOverride(submission.folder, null, null);
        assert.equal(record.present, true);
        assert.equal(record.applied, false);
        assert.equal(record.status, 'no-claim');
        assert.match(record.message, /ignored/);
        assert.match(record.message, /no nonlocalGame/);
    } finally {
        remove(submission.folder);
    }
});

test('a folder with no override file records nothing at all', () => {
    const submission = makeSubmission();
    try {
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
        assert.equal(result.verification.status, 'verified');
        assert.equal(Object.prototype.hasOwnProperty.call(result.verification, 'override'), false,
            'the published block gains no override key when there is no override');
        assert.equal(io.applyOverride(submission.folder, result, submission.countsSha256), null);
        assert.deepEqual(io.loadOverrideFile(submission.folder), { present: false });
    } finally {
        remove(submission.folder);
    }
});

/* ------------------------------------------------------------------ *
 * Paths and prototypes
 * ------------------------------------------------------------------ */

test('an override reached through a symbolic link is refused', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-override-outside-'));
    try {
        const elsewhere = path.join(outside, 'verify-override.json');
        fs.writeFileSync(elsewhere, JSON.stringify(validOverride(submission.countsSha256)));
        fs.symlinkSync(elsewhere, path.join(submission.folder, 'verify-override.json'));

        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
        assert.equal(result.valid, false, 'a linked-in approval must not suppress');
        assert.equal(result.verification.status, 'failed');
        assert.equal(result.verification.override.applied, false);
        assert.ok(warningWithCode(result, 'OVERRIDE_PATH_TRAVERSAL'));
    } finally {
        remove(submission.folder);
        remove(outside);
    }
});

test('an override in the parent folder is not picked up', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-override-parent-'));
    try {
        const child = path.join(parent, 'submission');
        fs.mkdirSync(child);
        fs.writeFileSync(path.join(parent, 'verify-override.json'),
            JSON.stringify(validOverride('c'.repeat(64))));

        assert.deepEqual(io.loadOverrideFile(child), { present: false });
    } finally {
        remove(parent);
    }
});

test('the counts file name guard still rejects every traversal attempt', () => {
    // `loadCountsFile` and the override read share one resolver, so this pins the guard both use.
    const submission = makeSubmission();
    try {
        ['../../etc/passwd.json', '../counts.json', 'sub/counts.json', '/etc/passwd.json', '..']
            .forEach((name) => {
                const attempt = io.loadCountsFile(submission.folder, name);
                assert.equal(attempt.ok, false, name);
                assert.equal(attempt.code, 'COUNTS_PATH_TRAVERSAL', name);
            });
        assert.deepEqual(io.loadOverrideFile(''), { present: false });
        assert.deepEqual(io.loadOverrideFile(null), { present: false });
    } finally {
        remove(submission.folder);
    }
});

test('an override carrying __proto__ leaves Object.prototype alone', () => {
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        const good = validOverride(submission.countsSha256);
        writeOverride(submission.folder, '{\n' +
            '  "__proto__": {"polluted": "yes", "ranked": true},\n' +
            '  "constructor": {"prototype": {"polluted": "yes"}},\n' +
            '  "reason": ' + JSON.stringify(good.reason) + ',\n' +
            '  "approvedBy": ' + JSON.stringify(good.approvedBy) + ',\n' +
            '  "approvedAt": ' + JSON.stringify(good.approvedAt) + ',\n' +
            '  "pr": ' + good.pr + ',\n' +
            '  "countsSha256": ' + JSON.stringify(good.countsSha256) + '\n' +
            '}\n');

        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});

        assert.equal({}.polluted, undefined, 'Object.prototype must be untouched');
        assert.equal(Object.prototype.polluted, undefined);
        assert.equal(Object.prototype.ranked, undefined);
        assert.equal(result.verification.override.applied, true,
            'unknown keys are ignored, not treated as malformity');
        assert.equal(result.verification.ranked, false,
            'ranked comes from the verifier, never from the override document');
        assert.equal(Object.keys(result.verification.override).indexOf('polluted'), -1);
    } finally {
        remove(submission.folder);
    }
});

/* ------------------------------------------------------------------ *
 * Through a real index build, which is the gate that matters
 * ------------------------------------------------------------------ */

test('enforce mode throws when the only override is stale', () => {
    const corpus = makeCorpus();
    try {
        const submission = addSubmission(corpus, 'stale_override', 0.5);
        writeOverride(submission.folder, validOverride('d'.repeat(64)));

        const sentinel = '[{"id":"previous good artifact"}]';
        fs.writeFileSync(corpus.outputFile, sentinel);

        assert.throws(
            () => build(corpus, 'enforce'),
            /stale_override/,
            'a stale override must not save the build'
        );
        assert.equal(fs.readFileSync(corpus.outputFile, 'utf8'), sentinel,
            'a rejected build leaves the previous index byte-identical on disk');
    } finally {
        remove(corpus.root);
    }
});

test('enforce mode throws when an override is malformed, and passes once it is fixed', () => {
    const corpus = makeCorpus();
    try {
        const submission = addSubmission(corpus, 'fixable', 0.5);
        writeOverride(submission.folder, '{"reason": "please just work"}');

        assert.throws(() => build(corpus, 'enforce'), /fixable/);

        writeOverride(submission.folder, validOverride(submission.countsSha256));
        const written = build(corpus, 'enforce');
        assert.equal(written.length, 1);
        assert.equal(written[0].verification.status, 'overridden');
    } finally {
        remove(corpus.root);
    }
});

test('enforce mode publishes a matching override as unverified and unranked', () => {
    const corpus = makeCorpus();
    try {
        const submission = addSubmission(corpus, 'accepted', 0.5);
        writeOverride(submission.folder, validOverride(submission.countsSha256));

        const written = build(corpus, 'enforce');
        assert.equal(written.length, 1);

        const verification = written[0].verification;
        assert.equal(verification.status, 'overridden');
        assert.equal(verification.ranked, false);
        assert.equal(verification.override.applied, true);
        assert.equal(verification.override.approvedBy, 'maintainer-handle');
        assert.equal(verification.override.pr, 128);
        assert.equal(verification.override.hashMatched, true);
        assert.equal(verification.override.expectedSha256, submission.countsSha256);
        assert.equal(verification.countsSha256, submission.countsSha256);
    } finally {
        remove(corpus.root);
    }
});

test('report mode evaluates the override too, and records the same block', () => {
    // The policy mode decides whether the build fails and nothing else. A `report` build must
    // reach the same conclusion about the override that an `enforce` build would.
    const corpus = makeCorpus();
    try {
        const applied = addSubmission(corpus, 'accepted', 0.5);
        writeOverride(applied.folder, validOverride(applied.countsSha256));
        const stale = addSubmission(corpus, 'stale_override', 0.5);
        writeOverride(stale.folder, validOverride('e'.repeat(64)));

        const written = build(corpus, 'report');
        assert.equal(written.length, 2);

        const byId = {};
        written.forEach((entry) => {
            byId[entry.benchmarkFolder] = entry.verification;
        });

        assert.equal(byId.accepted.status, 'overridden');
        assert.equal(byId.accepted.ranked, false);
        assert.equal(byId.accepted.override.applied, true);

        assert.equal(byId.stale_override.status, 'failed');
        assert.equal(byId.stale_override.ranked, false);
        assert.equal(byId.stale_override.override.applied, false);
        assert.equal(byId.stale_override.override.status, 'stale');
    } finally {
        remove(corpus.root);
    }
});

test('a submitted override cannot be forged inside benchmark.json', () => {
    // The only override this code reads is a separate committed file. A `verification` block
    // written into the submission is refused by the schema before it reaches the generator, and
    // the generator deletes any that arrives anyway, so a submitter has no way to write
    // `override.applied` into the index.
    const corpus = makeCorpus();
    try {
        const submission = addSubmission(corpus, 'forged');
        const benchmarkPath = path.join(submission.folder, 'benchmark.json');
        const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
        benchmark.verification = {
            status: 'verified',
            ranked: true,
            override: { applied: true, approvedBy: 'nobody' }
        };
        fs.writeFileSync(benchmarkPath, JSON.stringify(benchmark, null, 2));

        const written = build(corpus, 'enforce');
        assert.deepEqual(written, [], 'the schema refuses the forged block and the entry is dropped');
    } finally {
        remove(corpus.root);
    }
});

/* ------------------------------------------------------------------ *
 * The shipped example
 * ------------------------------------------------------------------ */

test('the shipped example override is format-valid and inert', () => {
    const examplePath = path.join(TEMPLATE_DIR, 'verify-override.example.json');
    const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

    // Format-valid: copying it into a live verify-override.json and correcting the digest works.
    const submission = makeSubmission({ winRate: 0.5 });
    try {
        writeOverride(submission.folder,
            Object.assign({}, example, { countsSha256: submission.countsSha256 }));
        const result = io.verifySubmissionFolder(submission.folder, submission.benchmark, {});
        assert.equal(result.verification.override.applied, true);
    } finally {
        remove(submission.folder);
    }

    // Inert: it is not named verify-override.json, so the template carries no override at all.
    assert.deepEqual(io.loadOverrideFile(TEMPLATE_DIR), { present: false });

    const benchmark = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'benchmark.json'), 'utf8'));
    const template = io.verifySubmissionFolder(TEMPLATE_DIR, benchmark, {});
    assert.equal(template.verification.status, 'verified');
    assert.equal(template.verification.ranked, true);
    assert.equal(Object.prototype.hasOwnProperty.call(template.verification, 'override'), false);
});
