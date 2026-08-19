#!/usr/bin/env node

/**
 * Recompute nonlocal-game win rates from the counts a submission ships.
 *
 * Usage:
 *   node scripts/verify-nonlocal-game.js                  # every submission folder
 *   node scripts/verify-nonlocal-game.js --all            # the same, explicitly
 *   node scripts/verify-nonlocal-game.js template         # named folders under submissions/
 *   node scripts/verify-nonlocal-game.js path/to/folder   # or explicit paths
 *   node scripts/verify-nonlocal-game.js --json           # machine-readable output
 *
 * A submission without a `nonlocalGame` block has nothing to recompute. That is reported as
 * "nothing to verify" and is NOT a failure: the legacy entries in the database predate the
 * counts format and remain valid unverified assertions. Exit status is 0 unless a submission that
 * does carry a claim fails to reproduce it.
 */

const fs = require('fs');
const path = require('path');

const io = require('./lib/nlg/io');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'submissions');

/**
 * Resolve one command-line target to a submission folder path.
 *
 * A bare name is looked up under `submissions/`; anything containing a separator, or naming an
 * existing directory, is used as given.
 *
 * @param {string} target - Folder name or path.
 * @returns {string} Absolute folder path.
 */
function resolveFolder(target) {
    if (target.indexOf('/') !== -1 || target.indexOf(path.sep) !== -1) {
        return path.resolve(target);
    }
    const underSubmissions = path.join(SUBMISSIONS_DIR, target);
    if (fs.existsSync(underSubmissions)) {
        return underSubmissions;
    }
    return path.resolve(target);
}

/**
 * Every submission folder that carries a `benchmark.json`, sorted by name.
 *
 * The template is included, unlike `validate-benchmark.js`, which skips it: the template ships a
 * complete counts document and is the smallest end-to-end check that the verifier still works.
 *
 * @returns {string[]} Absolute folder paths.
 */
function listSubmissionFolders() {
    if (!fs.existsSync(SUBMISSIONS_DIR)) {
        return [];
    }
    return fs.readdirSync(SUBMISSIONS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(SUBMISSIONS_DIR, entry.name))
        .filter((folder) => fs.existsSync(path.join(folder, 'benchmark.json')))
        .sort();
}

/**
 * Verify one folder.
 *
 * @param {string} folderPath - Absolute path to the submission folder.
 * @param {Object} [options] - Passed through to the verifier.
 * @returns {Object} `{folder, status, valid, errors, warnings, verification}`, where `status` is
 *   `'skipped'` when the submission carries no claim to recompute.
 */
function verifyFolder(folderPath, options) {
    const folder = path.basename(folderPath);
    const benchmarkPath = path.join(folderPath, 'benchmark.json');

    if (!fs.existsSync(benchmarkPath)) {
        return {
            folder: folder,
            status: 'error',
            valid: false,
            errors: [{ field: 'file', message: 'benchmark.json not found', code: 'BENCHMARK_MISSING' }],
            warnings: [],
            verification: null
        };
    }

    let benchmark;
    try {
        benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
    } catch (error) {
        return {
            folder: folder,
            status: 'error',
            valid: false,
            errors: [{
                field: 'file',
                message: 'benchmark.json is not valid JSON: ' + error.message,
                code: 'BENCHMARK_INVALID_JSON'
            }],
            warnings: [],
            verification: null
        };
    }

    const result = io.verifySubmissionFolder(folderPath, benchmark, options);
    if (result === null) {
        return {
            folder: folder,
            status: 'skipped',
            valid: true,
            errors: [],
            warnings: [],
            verification: null
        };
    }

    return {
        folder: folder,
        // Take the computed status when there is one: an overridden entry is valid, so a plain
        // valid/invalid mapping would report it as verified and hide the override.
        status: result.verification?.status || (result.valid ? 'verified' : 'failed'),
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        verification: result.verification
    };
}

/**
 * Print one folder's outcome in the repository's usual console style.
 *
 * @param {Object} result - Output of `verifyFolder`.
 * @returns {void}
 */
function report(result) {
    if (result.status === 'skipped') {
        console.log(`⏭️  ${result.folder}: no nonlocalGame block, nothing to verify`);
        return;
    }

    const verification = result.verification;
    const gameId = verification && verification.game ? verification.game.id : 'unknown game';

    if (result.valid) {
        // An overridden entry is valid but was not verified, so it does not get the pass icon.
        const icon = verification.status === 'overridden' ? '🔓' : '✅';
        console.log(`${icon} ${result.folder}: ${verification.status} (${gameId})`);
    } else {
        console.log(`❌ ${result.folder}: ${verification ? verification.status : 'failed'} (${gameId})`);
    }

    if (verification) {
        verification.checks.forEach((check) => {
            const icon = { pass: '✅', warn: '⚠️ ', fail: '❌', skip: '⏭️ ' }[check.status] || '  ';
            console.log(`   ${icon} ${check.id}: ${check.message}`);
        });
    }

    result.errors.forEach((error) => {
        console.log(`   - error ${error.code} at ${error.field}: ${error.message}`);
    });
    result.warnings.forEach((warning) => {
        console.log(`   - warning ${warning.code} at ${warning.field}: ${warning.message}`);
    });
}

/**
 * Verify a list of folders and summarize.
 *
 * @param {string[]} folders - Absolute folder paths.
 * @param {Object} [options] - Passed through to the verifier.
 * @returns {{results: Object[], summary: Object, allValid: boolean}} Aggregate outcome.
 */
function verifyFolders(folders, options) {
    const results = folders.map((folder) => verifyFolder(folder, options));
    const summary = {
        total: results.length,
        verified: results.filter((r) => r.status === 'verified').length,
        overridden: results.filter((r) => r.status === 'overridden').length,
        failed: results.filter((r) => r.status === 'failed' || r.status === 'error').length,
        skipped: results.filter((r) => r.status === 'skipped').length
    };
    return { results: results, summary: summary, allValid: summary.failed === 0 };
}

/**
 * Command-line entry point.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {number} Process exit code.
 */
function main(argv) {
    const asJson = argv.indexOf('--json') !== -1;
    const targets = argv.filter((arg) => arg !== '--json' && arg !== '--all');

    if (argv.indexOf('--help') !== -1 || argv.indexOf('-h') !== -1) {
        console.log('Usage:');
        console.log('  node scripts/verify-nonlocal-game.js [--json] [--all | <folder>...]');
        return 0;
    }

    const folders = targets.length > 0 ? targets.map(resolveFolder) : listSubmissionFolders();

    if (!asJson) {
        console.log('🔍 Recomputing nonlocal game results from submitted counts...\n');
    }

    const outcome = verifyFolders(folders);

    if (asJson) {
        console.log(JSON.stringify(outcome, null, 2));
        return outcome.allValid ? 0 : 1;
    }

    outcome.results.forEach((result) => {
        report(result);
        console.log('');
    });

    console.log('📊 Summary:');
    console.log(`   Submissions checked: ${outcome.summary.total}`);
    console.log(`   Verified: ${outcome.summary.verified}`);
    if (outcome.summary.overridden > 0) {
        console.log(`   Overridden (published unverified and unranked): ${outcome.summary.overridden}`);
    }
    console.log(`   Failed: ${outcome.summary.failed}`);
    console.log(`   Nothing to verify: ${outcome.summary.skipped}`);

    return outcome.allValid ? 0 : 1;
}

if (require.main === module) {
    process.exit(main(process.argv.slice(2)));
}

module.exports = {
    verifyFolder,
    verifyFolders,
    listSubmissionFolders,
    main
};
