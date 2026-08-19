#!/usr/bin/env node

/**
 * Resolve the submission folders a pull request touches, from a list of changed file paths.
 *
 * The file list arrives in `CHANGED_FILES` and is submitter-controlled: a branch can add a file
 * under any path it likes, including one whose name is shell or JavaScript. Reading it from the
 * environment rather than interpolating it into a workflow body is half of the defence; the other
 * half is here. The workflow produces the list with `git diff --name-only` against the merge base;
 * where that list comes from makes no difference to anything below, which treats it as hostile
 * either way. A name survives only when it
 *
 *   1. sits directly under `submissions/`,
 *   2. matches a conservative folder-name pattern, and
 *   3. names a directory that actually exists in the checkout.
 *
 * Nothing else is passed on, so a crafted path cannot become an argument, a flag, or a traversal.
 *
 * Usage:
 *   CHANGED_FILES="submissions/a/benchmark.json submissions/b/counts.json" \
 *     node scripts/ci/changed-submissions.js
 *
 * Outputs, when the corresponding GitHub Actions files are present:
 *   $GITHUB_ENV     QDB_FOLDERS=<space-separated names>
 *   $GITHUB_OUTPUT  count=<n>, folders=<space-separated names>
 *
 * Exit status is 0 even when nothing matched: a pull request that touches no submission folder is
 * an ordinary outcome, not a failure.
 */

const fs = require('fs');
const path = require('path');

const SUBMISSIONS_DIR = path.join(__dirname, '..', '..', 'submissions');

/**
 * Folder names this pipeline is willing to act on.
 *
 * Deliberately narrower than what a filesystem permits: no spaces, no leading dot, no separators,
 * nothing that a shell or an argument parser would read as anything but a literal word.
 */
const FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The template ships as documentation and is not a submission under review. */
const EXCLUDED_FOLDERS = ['template'];

/**
 * Split a whitespace-separated path list.
 *
 * `git diff --name-only` emits one path per line, and earlier producers of this variable used
 * spaces, so both are treated as separators. A path containing whitespace cannot survive this,
 * which is intended: such a path also cannot name a folder that passes `FOLDER_NAME_PATTERN`.
 *
 * @param {string} raw - Raw value of `CHANGED_FILES`.
 * @returns {string[]} Individual path strings, empties removed.
 */
function splitPaths(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return [];
    }
    return raw.split(/\s+/).filter((entry) => entry.length > 0);
}

/**
 * Reduce changed file paths to the submission folders they belong to.
 *
 * @param {string[]} paths - Changed file paths, repository-relative.
 * @param {string} [submissionsDir] - Directory to check names against.
 * @returns {{folders: string[], rejected: string[]}} Accepted folder names, sorted and unique, and
 *   the distinct candidate names that were refused.
 */
function submissionFolders(paths, submissionsDir) {
    const root = typeof submissionsDir === 'string' ? submissionsDir : SUBMISSIONS_DIR;
    const accepted = new Set();
    const rejected = new Set();

    paths.forEach((entry) => {
        const segments = entry.split('/');
        if (segments.length < 3 || segments[0] !== 'submissions') {
            return;
        }
        const name = segments[1];
        if (EXCLUDED_FOLDERS.indexOf(name) !== -1) {
            return;
        }
        if (!FOLDER_NAME_PATTERN.test(name)) {
            rejected.add(name);
            return;
        }
        let stats;
        try {
            stats = fs.statSync(path.join(root, name));
        } catch (error) {
            rejected.add(name);
            return;
        }
        if (!stats.isDirectory()) {
            rejected.add(name);
            return;
        }
        accepted.add(name);
    });

    return {
        folders: Array.from(accepted).sort(),
        rejected: Array.from(rejected).sort()
    };
}

/**
 * Append a `key=value` line to one of the GitHub Actions exchange files, when it is configured.
 *
 * Values here are folder names that already passed `FOLDER_NAME_PATTERN`, so they carry no newline
 * and need no heredoc delimiter.
 *
 * @param {string|undefined} file - Path from the environment, or undefined outside Actions.
 * @param {string} key - Variable name.
 * @param {string} value - Single-line value.
 * @returns {void}
 */
function appendKeyValue(file, key, value) {
    if (typeof file !== 'string' || file === '') {
        return;
    }
    fs.appendFileSync(file, `${key}=${value}\n`);
}

/**
 * Entry point.
 *
 * @param {Object} [env] - Environment to read. Defaults to `process.env`.
 * @returns {number} Process exit code.
 */
function main(env) {
    const environment = env || process.env;
    const resolved = submissionFolders(splitPaths(environment.CHANGED_FILES));
    const joined = resolved.folders.join(' ');

    if (resolved.rejected.length > 0) {
        console.warn('⚠️  Ignoring changed paths whose folder name is not a usable submission folder:');
        resolved.rejected.forEach((name) => console.warn(`   - ${JSON.stringify(name)}`));
    }

    if (resolved.folders.length === 0) {
        console.log('No submission folders changed.');
    } else {
        console.log(`Changed submission folders (${resolved.folders.length}):`);
        resolved.folders.forEach((name) => console.log(`   - ${name}`));
    }

    appendKeyValue(environment.GITHUB_ENV, 'QDB_FOLDERS', joined);
    appendKeyValue(environment.GITHUB_OUTPUT, 'folders', joined);
    appendKeyValue(environment.GITHUB_OUTPUT, 'count', String(resolved.folders.length));

    return 0;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = {
    FOLDER_NAME_PATTERN,
    splitPaths,
    submissionFolders,
    main
};
