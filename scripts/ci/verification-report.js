#!/usr/bin/env node

/**
 * Recompute the submitted nonlocal-game results and write a Markdown summary.
 *
 * The report is a file rather than a string a workflow builds, so the pull-request comment step can
 * point at it with a body path instead of interpolating anything into a script body. Nothing in
 * this file reads a workflow expression; the only inputs are the environment and the argument list.
 *
 * Usage:
 *   node scripts/ci/verification-report.js                 # every submission folder
 *   node scripts/ci/verification-report.js foo bar         # named folders under submissions/
 *   QDB_FOLDERS="foo bar" node scripts/ci/verification-report.js
 *
 * Environment:
 *   QDB_FOLDERS      Whitespace-separated folder names. Empty or unset means every folder.
 *   QDB_REPORT_PATH  Where to write the report. Defaults to `verification-report.md`.
 *   QDB_VERIFY       Policy override, reported for context only. It is the index generator, not
 *                    this script, that acts on the policy.
 *
 * The report is written before the exit status is decided, including on an unexpected failure, so
 * a workflow that always posts the comment always has a body to post. Exit status is 1 when a
 * submission that carries a claim failed to reproduce it.
 */

const fs = require('fs');
const path = require('path');

const verifier = require('../verify-nonlocal-game');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SUBMISSIONS_DIR = path.join(REPO_ROOT, 'submissions');
const DEFAULT_REPORT_PATH = path.join(REPO_ROOT, 'verification-report.md');

/** Icons matching the console output of `scripts/verify-nonlocal-game.js`. */
const STATUS_ICONS = {
    pass: '✅',
    warn: '⚠️',
    fail: '❌',
    skip: '⏭️',
    verified: '✅',
    failed: '❌',
    error: '❌',
    skipped: '⏭️',
    overridden: '🔓',
    unverified: '⏭️'
};

/**
 * Make a string safe to place inside a Markdown table cell.
 *
 * Check messages are generated text, but they carry recomputed numbers and folder names, so a
 * pipe or a newline in one would silently corrupt the table rather than fail loudly.
 *
 * @param {*} value - Cell content.
 * @returns {string} Escaped, single-line text.
 */
function cell(value) {
    if (value === null || value === undefined) {
        return '_n/a_';
    }
    return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Render a number for the report at enough precision to see a disagreement.
 *
 * @param {*} value - Candidate number.
 * @returns {string} Formatted value, or a placeholder when there is none.
 */
function num(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '_n/a_';
    }
    if (value === 0) {
        return '0';
    }
    if (Math.abs(value) < 1e-4) {
        return value.toExponential(3);
    }
    return String(Number(value.toPrecision(12)));
}

/**
 * Resolve the folders to check.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @param {Object} env - Environment to read `QDB_FOLDERS` from.
 * @returns {string[]} Absolute folder paths.
 */
function resolveFolders(argv, env) {
    const fromArgs = argv.filter((arg) => arg !== '--all' && !arg.startsWith('-'));
    const fromEnv = typeof env.QDB_FOLDERS === 'string'
        ? env.QDB_FOLDERS.split(/\s+/).filter((name) => name.length > 0)
        : [];
    const names = fromArgs.length > 0 ? fromArgs : fromEnv;

    if (names.length === 0) {
        return verifier.listSubmissionFolders();
    }
    return names.map((name) => path.join(SUBMISSIONS_DIR, path.basename(name)));
}

/**
 * Resolve the effective verification policy, for context in the report.
 *
 * The generator owns this decision and exposes the resolver; asking it keeps the report from
 * drifting into a second, subtly different reading of the same policy file. A generator that no
 * longer exposes it degrades to an unknown mode rather than to a wrong one.
 *
 * @param {Object} env - Environment to read.
 * @returns {{mode: string, source: string}} Effective mode and where it came from.
 */
function resolvePolicy(env) {
    try {
        // Required lazily: the report is more useful than the policy line in it, so a generator
        // that fails to load must not take the whole report down with it.
        const generateBenchmarkIndex = require('../generate-benchmark-index');
        if (typeof generateBenchmarkIndex.resolvePolicy !== 'function') {
            return { mode: 'unknown', source: 'the generator exposes no policy resolver' };
        }
        return generateBenchmarkIndex.resolvePolicy(undefined, env);
    } catch (error) {
        return { mode: 'unknown', source: `policy could not be resolved: ${error.message}` };
    }
}

/**
 * One row of the overview table.
 *
 * @param {Object} result - Output of `verifyFolder`.
 * @returns {string} A Markdown table row.
 */
function overviewRow(result) {
    const icon = STATUS_ICONS[result.status] || '';
    const verification = result.verification;

    if (!verification) {
        return `| \`${cell(result.folder)}\` | ${icon} ${cell(result.status)} | _n/a_ | _n/a_ | _n/a_ | _n/a_ |`;
    }

    const game = verification.game ? verification.game.id : null;
    const winRate = verification.winRate || {};
    const cells = [
        `\`${cell(result.folder)}\``,
        `${icon} ${cell(verification.status)}`,
        game ? `\`${cell(game)}\`` : '_n/a_',
        num(winRate.claimed),
        num(winRate.recomputedMean),
        num(winRate.delta)
    ];
    return `| ${cells.join(' | ')} |`;
}

/**
 * Per-submission detail: the five checks, then any errors and warnings.
 *
 * @param {Object} result - Output of `verifyFolder`.
 * @returns {string[]} Markdown lines.
 */
function detailSection(result) {
    const lines = [];
    const verification = result.verification;

    lines.push(`### \`${cell(result.folder)}\``, '');

    if (result.status === 'skipped') {
        lines.push('No `nonlocalGame` block, so there is no claim to recompute. ' +
            'This is not a failure: entries that predate the counts format stay valid ' +
            'unverified assertions.', '');
        return lines;
    }

    if (verification && Array.isArray(verification.checks) && verification.checks.length > 0) {
        lines.push('| Check | Status | Detail |', '| --- | --- | --- |');
        verification.checks.forEach((check) => {
            const icon = STATUS_ICONS[check.status] || '';
            lines.push(`| \`${cell(check.id)}\` | ${icon} ${cell(check.status)} | ${cell(check.message)} |`);
        });
        lines.push('');
    }

    if (verification) {
        lines.push(`Ranked: \`${verification.ranked === true}\`. ` +
            `Counts digest: \`${cell(verification.countsSha256)}\`.`, '');
    }

    if (result.errors.length > 0) {
        lines.push('**Errors**', '');
        result.errors.forEach((error) => {
            lines.push(`- \`${cell(error.code)}\` at \`${cell(error.field)}\`: ${cell(error.message)}`);
        });
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push('**Warnings**', '');
        result.warnings.forEach((warning) => {
            lines.push(`- \`${cell(warning.code)}\` at \`${cell(warning.field)}\`: ${cell(warning.message)}`);
        });
        lines.push('');
    }

    return lines;
}

/**
 * Build the whole report.
 *
 * @param {Object} outcome - Output of `verifyFolders`.
 * @param {{mode: string, source: string}} policy - Effective policy.
 * @returns {string} Markdown document.
 */
function buildReport(outcome, policy) {
    const summary = outcome.summary;
    const lines = [
        '## Benchmark submission verification',
        '',
        'Every reported number below was recomputed from the counts the submission ships, by ' +
        '`scripts/verify-nonlocal-game.js`. Nothing here is read from a committed flag.',
        '',
        `Policy mode: **${cell(policy.mode)}** (from ${cell(policy.source)}). The mode decides only ` +
        'whether a failure stops the build. Submissions are recomputed either way, and a failure is ' +
        'always recorded as unverified and unranked.',
        '',
        `**Checked:** ${summary.total} | **verified:** ${summary.verified} | ` +
        `**failed:** ${summary.failed} | **nothing to verify:** ${summary.skipped}`,
        ''
    ];

    if (summary.total === 0) {
        lines.push('No submission folders were selected, so there was nothing to recompute.', '');
    } else {
        lines.push(
            '| Submission | Result | Game | Claimed win rate | Recomputed | Difference |',
            '| --- | --- | --- | --- | --- | --- |'
        );
        outcome.results.forEach((result) => lines.push(overviewRow(result)));
        lines.push('');

        outcome.results.forEach((result) => {
            detailSection(result).forEach((line) => lines.push(line));
        });
    }

    lines.push(
        '---',
        '',
        'This check is advisory. The gate that decides what reaches the published site is the build ' +
        'step in `.github/workflows/deploy.yml`, which regenerates the index and stops before ' +
        'writing it when a submission fails. See `docs/verification.md`.',
        ''
    );

    return lines.join('\n');
}

/**
 * Report that a run failed before it could recompute anything.
 *
 * @param {Error} error - The thrown error.
 * @returns {string} Markdown document.
 */
function buildCrashReport(error) {
    return [
        '## Benchmark submission verification',
        '',
        '❌ Verification could not run to completion, so nothing below was recomputed. This is a ' +
        'fault in the check itself, not a verdict on the submission.',
        '',
        '```',
        String(error && error.stack ? error.stack : error).replace(/```/g, "'''"),
        '```',
        ''
    ].join('\n');
}

/**
 * Entry point.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @param {Object} [env] - Environment to read. Defaults to `process.env`.
 * @returns {number} Process exit code.
 */
function main(argv, env) {
    const environment = env || process.env;
    const reportPath = typeof environment.QDB_REPORT_PATH === 'string' && environment.QDB_REPORT_PATH !== ''
        ? path.resolve(environment.QDB_REPORT_PATH)
        : DEFAULT_REPORT_PATH;

    let markdown;
    let exitCode;
    try {
        const folders = resolveFolders(argv, environment);
        const outcome = verifier.verifyFolders(folders);
        markdown = buildReport(outcome, resolvePolicy(environment));
        exitCode = outcome.allValid ? 0 : 1;
    } catch (error) {
        markdown = buildCrashReport(error);
        exitCode = 1;
        console.error(error);
    }

    fs.writeFileSync(reportPath, markdown);
    console.log(markdown);
    console.log(`\n📝 Wrote ${reportPath}`);
    return exitCode;
}

if (require.main === module) {
    process.exit(main(process.argv.slice(2)));
}

module.exports = {
    buildReport,
    buildCrashReport,
    resolveFolders,
    main
};
