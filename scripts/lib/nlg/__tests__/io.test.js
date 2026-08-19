/**
 * Tests for `scripts/lib/nlg/io.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/*.test.js` (unquoted, so the shell expands the
 * glob).
 *
 * Two properties matter more than the happy path. First, a submitted file name never reaches the
 * filesystem unchecked: a separator, a `..`, an absolute path or a null byte is rejected on the
 * string, before any read. Second, `verifySubmissionFolder` returns `null` when the benchmark
 * carries no `nonlocalGame` block, because the Jest suite for the index generator mocks `fs`
 * wholesale with `existsSync` returning `true`, and an ungated read there would be handed
 * benchmark JSON in place of counts.
 *
 * Temporary fixtures are created inside `os.tmpdir()` and removed afterwards. Every file is read
 * inside a test body, never at module load time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const io = require('../io');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'submissions', 'template');
const SUBMISSIONS_DIR = path.join(REPO_ROOT, 'submissions');

/**
 * @param {string} filePath - Absolute path to a JSON file.
 * @returns {*} Parsed contents.
 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Read a JSON file that is allowed not to be there or not to parse.
 *
 * `submissions/README.md` says a folder without a `benchmark.json` is reported and skipped, so the
 * corpus walk below must survive one. Reading it unguarded would take down every test in this file
 * for a folder shape the repository documents as legitimate.
 *
 * @param {string} filePath - Absolute path to a JSON file.
 * @returns {{ok: true, value: *}|{ok: false, message: string}} Parsed contents, or the reason not.
 */
function tryReadJson(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        return { ok: false, message: 'could not be read: ' + error.message };
    }
    try {
        return { ok: true, value: JSON.parse(raw) };
    } catch (error) {
        return { ok: false, message: 'could not be parsed: ' + error.message };
    }
}

/**
 * Create a throwaway directory holding the given files.
 *
 * @param {Object<string, string>} files - File name to contents.
 * @returns {string} Absolute path to the directory.
 */
function makeFolder(files) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-nlg-io-'));
    Object.keys(files).forEach((name) => {
        fs.writeFileSync(path.join(folder, name), files[name]);
    });
    return folder;
}

/**
 * @param {string} folder - Directory to remove.
 * @returns {void}
 */
function removeFolder(folder) {
    fs.rmSync(folder, { recursive: true, force: true });
}

test('loadCountsFile reads and hashes a well-formed counts file', () => {
    const raw = fs.readFileSync(path.join(TEMPLATE_DIR, 'counts.json'), 'utf8');
    const loaded = io.loadCountsFile(TEMPLATE_DIR, 'counts.json');

    assert.equal(loaded.ok, true);
    assert.equal(loaded.doc.schemaVersion, 1);
    assert.equal(loaded.raw, raw);
    assert.equal(loaded.absolutePath, path.join(TEMPLATE_DIR, 'counts.json'));

    // The digest covers the RAW bytes, not a re-serialization, so an override recording it goes
    // stale the moment the file is edited in any way.
    assert.equal(loaded.sha256, crypto.createHash('sha256').update(raw).digest('hex'));
    assert.equal(loaded.sha256, io.sha256Hex(raw));
    assert.notEqual(loaded.sha256, io.sha256Hex(JSON.stringify(loaded.doc)));
});

test('loadCountsFile refuses to leave the submission folder', () => {
    const attempts = [
        '../../etc/passwd.json',
        '../counts.json',
        'sub/counts.json',
        'sub\\counts.json',
        '/etc/passwd.json',
        '..',
        '.',
        'a..b.json'
    ];

    attempts.forEach((name) => {
        const result = io.loadCountsFile(TEMPLATE_DIR, name);
        assert.equal(result.ok, false, name + ' must be rejected');
        assert.equal(result.code, 'COUNTS_PATH_TRAVERSAL', name + ' must report traversal');
        assert.ok(typeof result.message === 'string' && result.message.length > 0);
    });
});

test('loadCountsFile rejects a traversal before touching the filesystem', () => {
    // Point the loader at a folder that does not exist. A rejection that happened after a
    // filesystem call would report a missing file instead of a traversal.
    const missingFolder = path.join(os.tmpdir(), 'qdb-nlg-io-does-not-exist-' + Date.now());
    const result = io.loadCountsFile(missingFolder, '../../etc/passwd.json');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'COUNTS_PATH_TRAVERSAL');
});

test('loadCountsFile rejects names that are not usable file names', () => {
    ['', null, undefined, 42, {}].forEach((name) => {
        const result = io.loadCountsFile(TEMPLATE_DIR, name);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'COUNTS_FILE_INVALID_NAME');
    });

    const nullByte = io.loadCountsFile(TEMPLATE_DIR, 'counts\0.json');
    assert.equal(nullByte.ok, false);
    assert.equal(nullByte.code, 'COUNTS_FILE_INVALID_NAME');
});

test('loadCountsFile distinguishes missing, unreadable and invalid JSON', () => {
    const folder = makeFolder({ 'broken.json': '{ "schemaVersion": 1, ', 'ok.json': '{}' });
    try {
        const missing = io.loadCountsFile(folder, 'absent.json');
        assert.equal(missing.ok, false);
        assert.equal(missing.code, 'COUNTS_FILE_MISSING');

        const broken = io.loadCountsFile(folder, 'broken.json');
        assert.equal(broken.ok, false);
        assert.equal(broken.code, 'COUNTS_FILE_INVALID_JSON');

        // A directory reads as EISDIR rather than ENOENT, which is the unreadable case.
        fs.mkdirSync(path.join(folder, 'adirectory.json'));
        const unreadable = io.loadCountsFile(folder, 'adirectory.json');
        assert.equal(unreadable.ok, false);
        assert.equal(unreadable.code, 'COUNTS_FILE_UNREADABLE');
    } finally {
        removeFolder(folder);
    }
});

test('loadCountsFile never throws for a submitter-caused problem', () => {
    const folder = makeFolder({ 'x.json': 'not json at all' });
    try {
        [
            () => io.loadCountsFile(folder, 'x.json'),
            () => io.loadCountsFile(folder, 'missing.json'),
            () => io.loadCountsFile(folder, '../escape.json'),
            () => io.loadCountsFile('', 'x.json'),
            () => io.loadCountsFile(null, 'x.json')
        ].forEach((attempt) => {
            const result = attempt();
            assert.equal(result.ok, false);
            assert.equal(typeof result.code, 'string');
        });
    } finally {
        removeFolder(folder);
    }
});

test('verifySubmissionFolder returns null when there is nothing to verify', () => {
    // This is the gate that keeps the index generator's mocked filesystem from handing a counts
    // read the benchmark JSON back.
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, { metricValue: 1 }, {}), null);
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, {}, {}), null);
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, null, {}), null);
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, { nonlocalGame: null }, {}), null);
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, { nonlocalGame: 'g14' }, {}), null);
    assert.equal(io.verifySubmissionFolder(TEMPLATE_DIR, { nonlocalGame: [] }, {}), null);
});

test('every submission folder resolves the way its own benchmark.json says it should', () => {
    // Do not snapshot the corpus. The whole point of the counts format is that submissions
    // carrying counts arrive over time, so a hardcoded folder count goes red on the first real
    // one. The rule that does hold for every folder, now and later: a benchmark with no
    // nonlocalGame block has nothing to verify, and a benchmark with one produces a result.
    const folders = fs.readdirSync(SUBMISSIONS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'template')
        .map((entry) => entry.name);

    assert.ok(folders.length > 0, 'the submissions directory must not be empty');

    const preCounts = [];
    const withCounts = [];
    const unreadable = [];

    folders.forEach((name) => {
        const folder = path.join(SUBMISSIONS_DIR, name);
        const read = tryReadJson(path.join(folder, 'benchmark.json'));
        if (!read.ok) {
            // Reported and skipped, the way the generator treats it. A folder mid-review, or one
            // carrying only counts, is not this test's failure.
            unreadable.push(name + ': ' + read.message);
            return;
        }
        const benchmark = read.value;
        const claim = benchmark ? benchmark.nonlocalGame : null;
        const claimed = typeof claim === 'object' && claim !== null && !Array.isArray(claim);
        const result = io.verifySubmissionFolder(folder, benchmark, {});

        if (!claimed) {
            assert.equal(result, null,
                name + ' carries no nonlocalGame block and must report nothing to verify');
            preCounts.push(name);
            return;
        }

        // A submission that carries counts must produce a well-formed result. Whether that
        // result passes is the build gate's business, not this test's. A run that genuinely
        // fails to reproduce is a legitimate thing to hold in the corpus, and recording it must
        // not turn this suite red.
        assert.notEqual(result, null,
            name + ' carries a nonlocalGame block and must produce a verification result');
        const v = result.verification;
        assert.ok(['verified', 'failed', 'overridden', 'unverified'].includes(v.status),
            name + ' reported an unknown verification status: ' + v.status);
        assert.ok(Array.isArray(v.checks) && v.checks.length > 0,
            name + ' must report the checks it ran');
        assert.match(v.countsSha256, /^[0-9a-f]{64}$/,
            name + ' must record the digest of the counts it verified');
        assert.ok(Number.isFinite(v.winRate.recomputedMean),
            name + ' must recompute a finite win rate');
        assert.equal(v.winRate.delta, Math.abs(v.winRate.claimed - v.winRate.recomputedMean),
            name + ' must report the delta it actually measured');
        withCounts.push(name);
    });

    if (unreadable.length > 0) {
        console.log('Skipped ' + unreadable.length + ' folder(s) with no readable benchmark.json:');
        unreadable.forEach((line) => console.log('   - ' + line));
    }

    // Keep the nothing-to-verify path exercised. The legacy entries predate the counts format
    // and none of them will ever grow a block, so this stays true.
    assert.ok(preCounts.length > 0,
        'no folder exercised the nothing-to-verify path; the legacy corpus is missing');
    assert.ok(preCounts.length + withCounts.length > 0,
        'every submission folder was skipped as unreadable');
});

test('verifySubmissionFolder verifies the shipped template end to end', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const result = io.verifySubmissionFolder(TEMPLATE_DIR, benchmark, {});

    assert.notEqual(result, null);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(result.verification.status, 'verified');
    assert.equal(result.verification.ranked, true);
    assert.equal(result.verification.game.id, 'odd-cycle:n=3');
    assert.equal(result.verification.winRate.delta, 0);
    assert.equal(result.verification.uncertainty.claimed,
        result.verification.uncertainty.recomputed);

    const raw = fs.readFileSync(path.join(TEMPLATE_DIR, 'counts.json'), 'utf8');
    assert.equal(result.verification.countsSha256, io.sha256Hex(raw));

    assert.deepEqual(result.verification.checks.map((check) => check.status),
        ['pass', 'pass', 'pass', 'pass', 'pass']);
});

test('a counts file that cannot be loaded fails the submission rather than throwing', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const folder = makeFolder({ 'benchmark.json': JSON.stringify(benchmark) });
    try {
        const result = io.verifySubmissionFolder(folder, benchmark, {});
        assert.notEqual(result, null);
        assert.equal(result.valid, false);
        assert.equal(result.errors[0].code, 'COUNTS_FILE_MISSING');
        assert.equal(result.errors[0].field, 'nonlocalGame.countsFile');
        assert.equal(result.verification.status, 'failed');
        assert.equal(result.verification.ranked, false);
    } finally {
        removeFolder(folder);
    }
});

test('a traversal in countsFile fails the submission with a traversal code', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    benchmark.nonlocalGame.countsFile = '../../etc/passwd.json';

    const result = io.verifySubmissionFolder(TEMPLATE_DIR, benchmark, {});
    assert.notEqual(result, null);
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'COUNTS_PATH_TRAVERSAL');
    assert.equal(result.verification.ranked, false);
});

test('a submission carrying edited counts changes the digest', () => {
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));
    const raw = fs.readFileSync(path.join(TEMPLATE_DIR, 'counts.json'), 'utf8');
    const folder = makeFolder({
        'benchmark.json': JSON.stringify(benchmark),
        'counts.json': raw
    });
    try {
        const before = io.verifySubmissionFolder(folder, benchmark, {});
        assert.equal(before.verification.countsSha256, io.sha256Hex(raw));

        // A change that leaves the parsed value identical still moves the hash, which is what
        // makes the recorded digest a usable staleness check.
        fs.writeFileSync(path.join(folder, 'counts.json'), raw + '\n');
        const after = io.verifySubmissionFolder(folder, benchmark, {});
        assert.notEqual(after.verification.countsSha256, before.verification.countsSha256);
        assert.equal(after.valid, true);
    } finally {
        removeFolder(folder);
    }
});

test('io re-exports the hashing helper so other scripts share one implementation', () => {
    assert.equal(typeof io.sha256Hex, 'function');
    assert.equal(io.sha256Hex(''),
        crypto.createHash('sha256').update('').digest('hex'));
    assert.equal(io.sha256Hex(Buffer.from('bytes')), io.sha256Hex('bytes'));
});
