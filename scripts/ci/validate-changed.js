#!/usr/bin/env node

/**
 * Validate the submission folders a pull request changed, and only those.
 *
 * `npm run validate` walks the whole corpus and exits nonzero if any folder is invalid. That is
 * the right behaviour for the deploy build, which owns the published site, and the wrong behaviour
 * for a pull-request check: under `report` mode a submission that fails to reproduce its own claim
 * can legitimately sit on `main`, and from that moment a whole-corpus check turns every later
 * contributor's pull request red for a fault that is not theirs. During an event that is the
 * difference between one team being blocked and twenty-four being blocked.
 *
 * So the exit status here is decided by the changed folders alone. Everything else in the corpus is
 * still read, because duplicate detection is inherently cross-submission and a submission can only
 * be judged a duplicate against the rest, but a problem found out there is reported as a warning
 * against the corpus, never as this pull request's failure.
 *
 * Usage:
 *   QDB_FOLDERS="foo bar" node scripts/ci/validate-changed.js
 *   node scripts/ci/validate-changed.js foo bar
 *
 * Environment:
 *   QDB_FOLDERS  Whitespace-separated folder names, as written by scripts/ci/changed-submissions.js.
 *
 * Exit status is 0 when every named folder is valid, and 0 when no folder was named: a pull
 * request that touches no submission has nothing to validate and has not failed anything.
 */

const fs = require('fs');
const path = require('path');

const { validateBenchmarkFile, checkDuplicates } = require('../validate-benchmark');

const SUBMISSIONS_DIR = path.join(__dirname, '..', '..', 'submissions');

/** The template ships as documentation and is not a submission under review. */
const EXCLUDED_FOLDERS = ['template'];

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Every submission folder in the checkout.
 *
 * @param {string} [submissionsDir] - Directory to list.
 * @returns {string[]} Folder names, sorted, template excluded.
 */
function listFolders(submissionsDir) {
    const root = typeof submissionsDir === 'string' ? submissionsDir : SUBMISSIONS_DIR;
    return fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && EXCLUDED_FOLDERS.indexOf(entry.name) === -1)
        .map(entry => entry.name)
        .sort();
}

/**
 * Resolve the folders to validate.
 *
 * Names arrive already filtered by `scripts/ci/changed-submissions.js`, which keeps only names
 * matching a conservative pattern that resolve to a real directory. `path.basename` here is belt
 * and braces for the command-line route, so a name can never climb out of `submissions/`.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @param {Object} env - Environment to read `QDB_FOLDERS` from.
 * @returns {string[]} Folder names, unique and sorted.
 */
function resolveTargets(argv, env) {
    const fromArgs = argv.filter(arg => !arg.startsWith('-'));
    const fromEnv = typeof env.QDB_FOLDERS === 'string'
        ? env.QDB_FOLDERS.split(/\s+/).filter(name => name.length > 0)
        : [];
    const names = fromArgs.length > 0 ? fromArgs : fromEnv;

    const accepted = new Set();
    names.forEach((name) => {
        const folder = path.basename(name);
        if (EXCLUDED_FOLDERS.indexOf(folder) !== -1) {
            return;
        }
        accepted.add(folder);
    });
    return Array.from(accepted).sort();
}

/**
 * Read every submission in the corpus for duplicate detection.
 *
 * Parsing only, no schema validation and no recomputation: the corpus outside this pull request is
 * not this pull request's business, and the duplicate signature needs nothing more than the parsed
 * document. A folder that cannot be read is recorded rather than thrown on, so a broken submission
 * on `main` costs a warning line instead of the whole check.
 *
 * @param {string[]} folders - Folder names to read.
 * @param {string} submissionsDir - Directory holding them.
 * @returns {{benchmarks: Object[], unreadable: Array<{folder: string, message: string}>}} Corpus.
 */
function loadCorpus(folders, submissionsDir) {
    const benchmarks = [];
    const unreadable = [];

    folders.forEach((folder) => {
        const benchmarkPath = path.join(submissionsDir, folder, 'benchmark.json');
        if (!fs.existsSync(benchmarkPath)) {
            unreadable.push({ folder, message: 'no benchmark.json' });
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
        } catch (error) {
            unreadable.push({ folder, message: `could not be parsed: ${error.message}` });
            return;
        }
        if (!isPlainObject(parsed)) {
            unreadable.push({ folder, message: 'benchmark.json is not a JSON object' });
            return;
        }
        parsed.benchmarkFolder = folder;
        if (!parsed.id) {
            parsed.id = folder;
        }
        benchmarks.push(parsed);
    });

    return { benchmarks, unreadable };
}

/**
 * Validate one folder and print the outcome.
 *
 * @param {string} folder - Folder name.
 * @param {string} submissionsDir - Directory holding it.
 * @returns {boolean} Whether the folder is valid.
 */
function validateFolder(folder, submissionsDir) {
    const benchmarkPath = path.join(submissionsDir, folder, 'benchmark.json');

    if (!fs.existsSync(benchmarkPath)) {
        console.log(`❌ ${folder}: no benchmark.json found`);
        return false;
    }

    console.log(`📁 Validating ${folder}...`);
    const result = validateBenchmarkFile(benchmarkPath, folder);

    if (result.valid) {
        console.log(`✅ ${folder}: Valid`);
    } else {
        console.log(`❌ ${folder}: Invalid`);
        result.errors.forEach(err => console.log(`   - ${err.field}: ${err.message}`));
    }

    if (result.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        result.warnings.forEach(warn => console.log(`   - ${warn.field}: ${warn.message}`));
    }

    console.log('');
    return result.valid;
}

/**
 * Entry point.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @param {Object} [env] - Environment to read. Defaults to `process.env`.
 * @param {string} [submissionsDir] - Directory to work in. Defaults to `submissions/`.
 * @returns {number} Process exit code.
 */
function main(argv, env, submissionsDir) {
    const environment = env || process.env;
    const root = typeof submissionsDir === 'string' ? submissionsDir : SUBMISSIONS_DIR;
    const targets = resolveTargets(argv || [], environment);

    if (targets.length === 0) {
        console.log('No submission folders to validate.');
        return 0;
    }

    console.log(`🔍 Validating the ${targets.length} submission folder(s) this pull request changed...\n`);
    const invalid = targets.filter(folder => !validateFolder(folder, root));

    // Corpus-wide, because a submission can only be judged a duplicate against the rest.
    console.log('🔍 Checking for duplicate submissions across the whole corpus...');
    const corpus = loadCorpus(listFolders(root), root);
    const changed = new Set(targets);
    const duplicates = checkDuplicates(corpus.benchmarks, root);
    const mine = duplicates.filter(dup => changed.has(dup.current) || changed.has(dup.existing));
    const theirs = duplicates.filter(dup => !changed.has(dup.current) && !changed.has(dup.existing));

    if (duplicates.length === 0) {
        console.log('✅ No duplicates found');
    }
    if (mine.length > 0) {
        console.log('⚠️  Potential duplicates involving this pull request:');
        mine.forEach(dup => console.log(`   - ${dup.current} may duplicate ${dup.existing} (${dup.signature})`));
    }
    if (theirs.length > 0) {
        console.log('⚠️  Pre-existing duplicates elsewhere in the corpus, not caused by this pull request:');
        theirs.forEach(dup => console.log(`   - ${dup.current} may duplicate ${dup.existing} (${dup.signature})`));
    }
    if (corpus.unreadable.length > 0) {
        console.log('⚠️  Submissions elsewhere in the corpus that could not be read for duplicate detection:');
        corpus.unreadable
            .filter(entry => !changed.has(entry.folder))
            .forEach(entry => console.log(`   - ${entry.folder}: ${entry.message}`));
    }

    console.log('\n📊 Summary:');
    console.log(`   Changed folders validated: ${targets.length}`);
    console.log(`   Valid: ${targets.length - invalid.length}`);
    console.log(`   Invalid: ${invalid.length}`);
    console.log(`   Duplicates involving this pull request: ${mine.length}`);
    console.log(`   Duplicates elsewhere in the corpus (warning only): ${theirs.length}`);

    if (invalid.length > 0) {
        console.log(`\n❌ Invalid: ${invalid.join(', ')}`);
        return 1;
    }
    console.log('\n✅ Every submission folder this pull request changed is valid.');
    return 0;
}

if (require.main === module) {
    process.exit(main(process.argv.slice(2)));
}

module.exports = {
    listFolders,
    resolveTargets,
    loadCorpus,
    main
};
