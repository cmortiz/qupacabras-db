#!/usr/bin/env node

/**
 * Turn a submission issue into a submission folder.
 *
 * The issue body is untrusted text. Every value in it was typed by whoever opened the issue, and
 * `issue-to-pr.yml` runs with `contents: write` and `pull-requests: write`, so nothing here may
 * assume good faith. Three rules hold that boundary.
 *
 *   1. The body arrives through `ISSUE_BODY` in the environment. It is never interpolated into a
 *      workflow `run:` or `script:` body, where it would be pasted in as text before the shell or
 *      the script engine saw it.
 *   2. The folder name is derived from validated fields and then re-checked against the same
 *      pattern `scripts/ci/changed-submissions.js` uses. A name that fails is refused rather than
 *      repaired, so no submitted string ever becomes a path segment on its own authority.
 *   3. Nothing is written under `submissions/` until the document has passed the real schema and,
 *      when it carries counts, the real verifier. A submission that cannot verify is reported back
 *      on the issue instead of becoming a pull request that is certain to fail the gate.
 *
 * The counts document is pasted into the issue rather than fetched from a URL. Fetching a
 * submitter-controlled URL from a job that holds write permissions is a request forgery with a
 * privileged runner behind it, and the bytes a reviewer reads would not be the bytes that were
 * verified. A paste is bounded, reproducible, and visible in the pull-request diff. The bound is
 * real: a fully dense G14 counts document is 31,340 characters pretty-printed and 19,096 compact,
 * against GitHub's 65,536-character limit on an issue body, so every registered game fits. Anything
 * larger is directed to the pull-request route in `submissions/README.md`.
 *
 * Usage:
 *   ISSUE_BODY="$(cat body.md)" ISSUE_NUMBER=12 node scripts/ci/issue-submission.js
 *
 * Environment:
 *   ISSUE_BODY              Raw issue body. Required.
 *   ISSUE_NUMBER            Issue number, a positive integer. Required.
 *   ISSUE_AUTHOR            GitHub login of the issue author. Optional.
 *   QDB_SUBMISSIONS_DIR     Where the folder is written. Defaults to `submissions/`. Point it at a
 *                           scratch directory to exercise this script without touching the repo.
 *   QDB_SUBMISSION_REPORT   Where the Markdown report is written. Defaults to
 *                           `issue-submission-report.md` at the repository root.
 *
 * Outputs, when `$GITHUB_OUTPUT` is present:
 *   ok=true|false, dir_name=<folder>, algorithm_name=<single-line name>, has_counts=true|false
 *
 * Exit status is 0 when a folder was written and 1 when it was not. The report is written either
 * way, including after an unexpected failure, so the workflow always has a body to post.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { FOLDER_NAME_PATTERN } = require('./changed-submissions');
const { validateBenchmarkFile } = require('../validate-benchmark');
const { listGames } = require('../lib/nlg/registry');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SUBMISSIONS_DIR = path.join(REPO_ROOT, 'submissions');
const DEFAULT_REPORT_PATH = path.join(REPO_ROOT, 'issue-submission-report.md');

/**
 * Largest counts paste this route accepts.
 *
 * Measured against the registry rather than guessed: a G14 counts document with every one of its
 * 88 questions carrying all 16 answer keys is 31,340 characters pretty-printed. GitHub refuses an
 * issue body over 65,536 characters, so a paste above this cap has already spent most of the body
 * budget and the contributor is better served by the pull-request route.
 */
const MAX_COUNTS_CHARS = 50000;

/** Longest single-line value accepted for a name that ends up in a commit message or a title. */
const MAX_TITLE_CHARS = 100;

/**
 * Longest folder name, which is also the entry `id`.
 *
 * The schema caps `id` at 50 characters, so the slug taken from the algorithm name is budgeted
 * against whatever the `_issue<n>` suffix costs rather than against a fixed number. A fixed slug
 * length produced a name that passed the folder pattern and then failed the schema.
 */
const MAX_FOLDER_CHARS = 50;

/** Keys refused in `nonlocalGame.params`, whatever the key pattern would allow. */
const FORBIDDEN_PARAM_KEYS = ['__proto__', 'constructor', 'prototype'];

/** Parameter names the registry could plausibly take: a letter, then letters, digits, underscores. */
const PARAM_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/** Placeholder GitHub writes into the body for a field the contributor left blank. */
const NO_RESPONSE = '_No response_';

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {*} value - Extracted field value.
 * @returns {boolean} Whether the contributor left the field blank.
 */
function isEmpty(value) {
    return typeof value !== 'string' || value.trim() === '' || value.trim() === NO_RESPONSE;
}

/**
 * Record a rejection.
 *
 * @param {Array} errors - Accumulator.
 * @param {string} field - Form field or JSON pointer the problem belongs to.
 * @param {string} message - What is wrong, in words a contributor can act on.
 * @param {string} code - Stable identifier.
 * @returns {void}
 */
function reject(errors, field, message, code) {
    errors.push({ field: field, message: message, code: code });
}

/**
 * Split an issue-form body into its sections.
 *
 * GitHub renders each field as a `### <label>` heading followed by the value. Splitting on the
 * headings is what a prefix-matching regular expression cannot do safely: `### Shots` is a prefix
 * of `### Shots Per Circuit`, and a regular expression anchored on the prefix reads the wrong
 * field. Sections land in a null-prototype object, so a heading of `__proto__` is an ordinary key
 * rather than a reference to the prototype chain.
 *
 * The first occurrence of a heading wins. A contributor can type `### Metric Value` inside a
 * textarea and produce a second section with that name, but every value is validated downstream and
 * the only submission they can affect is their own.
 *
 * @param {string} body - Raw issue body.
 * @returns {Object} Null-prototype map from heading text to the text underneath it.
 */
function parseSections(body) {
    const sections = Object.create(null);
    if (typeof body !== 'string') {
        return sections;
    }

    const lines = body.replace(/\r\n/g, '\n').split('\n');
    let heading = null;
    let buffer = [];

    const flush = () => {
        if (heading !== null && !Object.prototype.hasOwnProperty.call(sections, heading)) {
            sections[heading] = buffer.join('\n').trim();
        }
        buffer = [];
    };

    lines.forEach((line) => {
        const match = /^###\s+(.+?)\s*$/.exec(line);
        if (match) {
            flush();
            heading = match[1];
            return;
        }
        buffer.push(line);
    });
    flush();

    return sections;
}

/**
 * Read one section.
 *
 * @param {Object} sections - Output of `parseSections`.
 * @param {string} label - Exact heading text.
 * @returns {string|null} The section text, or null when the field is absent or blank.
 */
function section(sections, label) {
    if (!Object.prototype.hasOwnProperty.call(sections, label)) {
        return null;
    }
    const value = sections[label];
    return isEmpty(value) ? null : value.trim();
}

/**
 * Remove the fenced code block GitHub wraps a rendered textarea in.
 *
 * A textarea declared with `render:` arrives as ```` ```json ```` ... ```` ``` ````. Writing that
 * fence into the file was the old behaviour and it produced a `circuit.qasm` starting with three
 * backticks. Only a fence that opens on the first line and closes on the last is removed, so
 * content that merely contains a fence is left alone.
 *
 * @param {string|null} value - Section text.
 * @returns {string|null} Text with an enclosing fence removed.
 */
function stripCodeFence(value) {
    if (typeof value !== 'string') {
        return value;
    }
    const lines = value.split('\n');
    if (lines.length < 2) {
        return value;
    }
    if (!/^```[A-Za-z0-9_-]*\s*$/.test(lines[0]) || !/^```\s*$/.test(lines[lines.length - 1])) {
        return value;
    }
    const inner = lines.slice(1, -1).join('\n');
    return inner.trim() === '' ? null : inner;
}

/**
 * Normalise pasted file content: one line ending, one trailing newline.
 *
 * The same bytes are verified and committed, so the digest recorded in the verification block is
 * the digest of the file a reviewer reads.
 *
 * @param {string} value - Pasted text.
 * @returns {string} Normalised text.
 */
function normalizeFileText(value) {
    return `${value.replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`;
}

/**
 * Collapse a value to a single line short enough for a commit message or a pull-request title.
 *
 * @param {string} value - Untrusted text.
 * @returns {string} One line, control characters removed, truncated.
 */
function singleLine(value) {
    const flattened = String(value)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return flattened.length > MAX_TITLE_CHARS ? flattened.slice(0, MAX_TITLE_CHARS).trim() : flattened;
}

/**
 * Parse a floating point field.
 *
 * @param {string|null} raw - Section text.
 * @param {string} label - Field label, for the message.
 * @param {Array} errors - Accumulator.
 * @param {Object} [opts] - `min` and `max` bounds.
 * @returns {number|null} The number, or null when absent or unusable.
 */
function parseNum(raw, label, errors, opts) {
    if (isEmpty(raw)) {
        return null;
    }
    const bounds = isPlainObject(opts) ? opts : {};
    const value = Number(raw.trim());
    if (!Number.isFinite(value)) {
        reject(errors, label, `"${singleLine(raw)}" is not a number`, 'NOT_A_NUMBER');
        return null;
    }
    if (bounds.min !== undefined && value < bounds.min) {
        reject(errors, label, `${value} must be at least ${bounds.min}`, 'OUT_OF_RANGE');
        return null;
    }
    if (bounds.max !== undefined && value > bounds.max) {
        reject(errors, label, `${value} must be at most ${bounds.max}`, 'OUT_OF_RANGE');
        return null;
    }
    return value;
}

/**
 * Parse an integer field.
 *
 * `Number` rather than `parseInt`, so `12abc` is refused instead of silently becoming 12.
 *
 * @param {string|null} raw - Section text.
 * @param {string} label - Field label, for the message.
 * @param {Array} errors - Accumulator.
 * @param {Object} [opts] - `min` bound.
 * @returns {number|null} The integer, or null when absent or unusable.
 */
function parseIntegerField(raw, label, errors, opts) {
    if (isEmpty(raw)) {
        return null;
    }
    const bounds = isPlainObject(opts) ? opts : {};
    const value = Number(raw.trim());
    if (!Number.isInteger(value)) {
        reject(errors, label, `"${singleLine(raw)}" is not a whole number`, 'NOT_AN_INTEGER');
        return null;
    }
    if (bounds.min !== undefined && value < bounds.min) {
        reject(errors, label, `${value} must be at least ${bounds.min}`, 'OUT_OF_RANGE');
        return null;
    }
    return value;
}

/**
 * Parse the integer parameters that select a member of a game family.
 *
 * The registry rejects an unknown or badly typed parameter itself, so this only has to stop a value
 * that is not a parameter map at all reaching it, and stop a key that would mean something to the
 * JavaScript object model rather than to the game.
 *
 * @param {string|null} raw - Section text, a small JSON object.
 * @param {string} label - Field label, for the message.
 * @param {Array} errors - Accumulator.
 * @returns {Object|null} A plain object of integers, or null.
 */
function parseGameParams(raw, label, errors) {
    if (isEmpty(raw)) {
        return null;
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        reject(errors, label, `not valid JSON: ${error.message}. Write it as {"n": 5}.`,
            'PARAMS_INVALID_JSON');
        return null;
    }

    if (!isPlainObject(parsed)) {
        reject(errors, label, 'must be a JSON object such as {"n": 5}', 'PARAMS_NOT_AN_OBJECT');
        return null;
    }

    const params = {};
    let usable = true;

    Object.keys(parsed).forEach((key) => {
        if (FORBIDDEN_PARAM_KEYS.indexOf(key) !== -1 || !PARAM_KEY_PATTERN.test(key)) {
            reject(errors, label, `parameter name ${JSON.stringify(key)} is not a usable name`,
                'PARAMS_BAD_KEY');
            usable = false;
            return;
        }
        const value = Object.getOwnPropertyDescriptor(parsed, key).value;
        if (!Number.isInteger(value)) {
            reject(errors, label, `parameter "${key}" must be a whole number`, 'PARAMS_BAD_VALUE');
            usable = false;
            return;
        }
        params[key] = value;
    });

    if (!usable) {
        return null;
    }
    return Object.keys(params).length > 0 ? params : null;
}

/**
 * Derive the submission folder name.
 *
 * The name is built from validated pieces and then checked against the same pattern the pull-request
 * workflow filters changed paths with. A name that fails the check is refused: a folder name never
 * comes out of an issue body on its own authority, and a slug that reduces to nothing falls back to
 * a fixed word rather than to an empty path segment.
 *
 * @param {string} algorithmName - Untrusted algorithm name.
 * @param {number} issueNumber - Validated issue number.
 * @param {Array} errors - Accumulator.
 * @returns {string|null} The folder name, or null when one could not be built.
 */
function submissionFolderName(algorithmName, issueNumber, errors) {
    const suffix = `_issue${issueNumber}`;
    const budget = MAX_FOLDER_CHARS - suffix.length;
    if (budget < 1) {
        reject(errors, 'issue', `issue number ${issueNumber} leaves no room for a folder name`,
            'FOLDER_NAME_REJECTED');
        return null;
    }

    const slug = String(algorithmName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, budget)
        .replace(/_+$/g, '');

    const name = `${slug === '' ? 'submission' : slug}${suffix}`;

    if (!FOLDER_NAME_PATTERN.test(name) || name.length > MAX_FOLDER_CHARS) {
        reject(errors, 'Algorithm Name',
            `could not be turned into a usable folder name (got ${JSON.stringify(name)})`,
            'FOLDER_NAME_REJECTED');
        return null;
    }
    return name;
}

/**
 * Assemble the `nonlocalGame` block from the counts fields.
 *
 * The five result fields travel together: a claim without counts cannot be recomputed, and counts
 * without a claim have nothing to check. Supplying some of them is a mistake worth naming rather
 * than quietly dropping.
 *
 * The event team name is deliberately NOT one of them. It is an optional label on a result that is
 * otherwise complete, so filling it in must not demand the other five, and leaving it out must not
 * reject the submission. It is attached only when a block is actually being built.
 *
 * @param {Object} sections - Output of `parseSections`.
 * @param {Array} errors - Accumulator.
 * @returns {{block: Object, countsText: string}|null} The block and the counts file text, or null
 *   when the submission carries no nonlocal-game claim.
 */
function buildNonlocalGame(sections, errors) {
    const gameName = section(sections, 'Nonlocal Game');
    const paramsRaw = section(sections, 'Game Parameters (JSON)');
    const winRateRaw = section(sections, 'Nonlocal Game Win Rate');
    const shotsRaw = section(sections, 'Shots Per Circuit');
    const countsRaw = stripCodeFence(section(sections, 'Counts Document (JSON)'));
    const eventTeamRaw = section(sections, 'Event Team Name');

    const supplied = [gameName, paramsRaw, winRateRaw, shotsRaw, countsRaw]
        .filter((value) => value !== null);
    if (supplied.length === 0) {
        return null;
    }

    const games = listGames();
    if (gameName === null) {
        reject(errors, 'Nonlocal Game',
            `required once any counts field is filled in. Pick one of: ${games.join(', ')}.`,
            'GAME_REQUIRED');
    } else if (games.indexOf(gameName) === -1) {
        reject(errors, 'Nonlocal Game',
            `"${singleLine(gameName)}" is not a registered game. Pick one of: ${games.join(', ')}.`,
            'GAME_UNKNOWN');
    }

    const params = parseGameParams(paramsRaw, 'Game Parameters (JSON)', errors);
    const winRate = parseNum(winRateRaw, 'Nonlocal Game Win Rate', errors, { min: 0, max: 1 });
    const shots = parseIntegerField(shotsRaw, 'Shots Per Circuit', errors, { min: 1 });

    if (winRate === null && winRateRaw === null) {
        reject(errors, 'Nonlocal Game Win Rate',
            'required once any counts field is filled in', 'WIN_RATE_REQUIRED');
    }
    if (shots === null && shotsRaw === null) {
        reject(errors, 'Shots Per Circuit',
            'required once any counts field is filled in', 'SHOTS_REQUIRED');
    }

    if (countsRaw === null) {
        reject(errors, 'Counts Document (JSON)',
            'required once any counts field is filled in. Without the raw counts there is nothing ' +
                'to recompute the win rate from.',
            'COUNTS_REQUIRED');
        return null;
    }

    if (countsRaw.length > MAX_COUNTS_CHARS) {
        reject(errors, 'Counts Document (JSON)',
            `${countsRaw.length} characters is over the ${MAX_COUNTS_CHARS} character limit for ` +
                'this route. Open a pull request carrying benchmark.json and counts.json instead; ' +
                'submissions/README.md describes it.',
            'COUNTS_TOO_LARGE');
        return null;
    }

    let countsDoc;
    try {
        countsDoc = JSON.parse(countsRaw);
    } catch (error) {
        reject(errors, 'Counts Document (JSON)', `not valid JSON: ${error.message}`,
            'COUNTS_INVALID_JSON');
        return null;
    }
    if (!isPlainObject(countsDoc)) {
        reject(errors, 'Counts Document (JSON)',
            'must be a JSON object with schemaVersion and counts', 'COUNTS_NOT_AN_OBJECT');
        return null;
    }

    if (gameName === null || games.indexOf(gameName) === -1 || winRate === null || shots === null) {
        return null;
    }

    const block = {
        game: gameName,
        winRate: winRate,
        shotsPerCircuit: shots,
        countsFile: 'counts.json'
    };
    if (params !== null) {
        block.params = params;
    }
    // `singleLine` flattens control characters and caps the value at 100 characters, which is the
    // schema's own limit on this field, so no separate length check is needed here.
    if (eventTeamRaw !== null) {
        const eventTeam = singleLine(eventTeamRaw);
        if (eventTeam !== '') {
            block.eventTeam = eventTeam;
        }
    }

    return { block: block, countsText: normalizeFileText(countsRaw) };
}

/**
 * Build the benchmark document from the parsed sections.
 *
 * A direct port of the logic that used to live inside the workflow's `script:` body, with the
 * nonlocal-game block added. Nothing here decides whether the document is acceptable; that is the
 * schema's and the verifier's job, and both run against the written file.
 *
 * @param {Object} sections - Output of `parseSections`.
 * @param {Object} meta - `{dirName, issueNumber, author, existingTimestamp}`.
 * @param {Array} errors - Accumulator.
 * @returns {{benchmark: Object, qasm: string|null, countsText: string|null}} The document and the
 *   extra files it needs.
 */
function buildBenchmark(sections, meta, errors) {
    const algorithmName = section(sections, 'Algorithm Name');
    const device = section(sections, 'Quantum Device');
    const metricName = section(sections, 'Metric Name');
    const metricValueRaw = section(sections, 'Metric Value');

    if (algorithmName === null) {
        reject(errors, 'Algorithm Name', 'required', 'FIELD_REQUIRED');
    }
    if (device === null) {
        reject(errors, 'Quantum Device', 'required', 'FIELD_REQUIRED');
    }
    if (metricName === null) {
        reject(errors, 'Metric Name', 'required', 'FIELD_REQUIRED');
    }
    if (metricValueRaw === null) {
        reject(errors, 'Metric Value', 'required', 'FIELD_REQUIRED');
    }

    const metricValue = parseNum(metricValueRaw, 'Metric Value', errors, { min: 0, max: 1 });
    const uncertainty = parseNum(section(sections, 'Uncertainty (Optional)'), 'Uncertainty', errors, { min: 0 });
    const oneQubitFidelity = parseNum(section(sections, '1-Qubit Gate Fidelity'), '1-Qubit Gate Fidelity', errors, { min: 0, max: 1 });
    const twoQubitFidelity = parseNum(section(sections, '2-Qubit Gate Fidelity'), '2-Qubit Gate Fidelity', errors, { min: 0, max: 1 });
    const qubitFidelity = parseNum(section(sections, 'Qubit Fidelity'), 'Qubit Fidelity', errors, { min: 0, max: 1 });
    const readoutFidelity = parseNum(section(sections, 'Readout Fidelity'), 'Readout Fidelity', errors, { min: 0, max: 1 });
    const circuitDuration = parseNum(section(sections, 'Circuit Duration in microseconds'), 'Circuit Duration in microseconds', errors, { min: 0 });
    const t1 = parseNum(section(sections, 'T1 in microseconds'), 'T1 in microseconds', errors, { min: 0 });
    const t2 = parseNum(section(sections, 'T2 in microseconds'), 'T2 in microseconds', errors, { min: 0 });
    const lambda1 = parseNum(section(sections, 'λ₁ (Normalized Laplacian)'), 'λ₁ (Normalized Laplacian)', errors, { min: 0, max: 2 });
    const qtvRaw = parseNum(section(sections, 'Qubit Time Volume (Raw)'), 'Qubit Time Volume (Raw)', errors, { min: 0 });
    const qtvNorm = parseNum(section(sections, 'Qubit Time Volume (Normalized /T2)'), 'Qubit Time Volume (Normalized /T2)', errors, { min: 0 });

    const qubitRangeMin = parseIntegerField(section(sections, 'Qubit Range (Min)'), 'Qubit Range (Min)', errors, { min: 1 });
    const qubitRangeMax = parseIntegerField(section(sections, 'Qubit Range (Max)'), 'Qubit Range (Max)', errors, { min: 1 });
    const depthRangeMin = parseIntegerField(section(sections, 'Circuit Depth Range (Min)'), 'Circuit Depth Range (Min)', errors, { min: 1 });
    const depthRangeMax = parseIntegerField(section(sections, 'Circuit Depth Range (Max)'), 'Circuit Depth Range (Max)', errors, { min: 1 });
    const shots = parseIntegerField(section(sections, 'Shots'), 'Shots', errors, { min: 1 });
    const gateCount = parseIntegerField(section(sections, 'Total Gate Count'), 'Total Gate Count', errors, { min: 0 });

    const uncertaintyDefinition = section(sections, 'Uncertainty Definition (Optional)');
    const primaryMetricDefinition = section(sections, 'Primary Metric Definition');
    const fidelityMeasurementMethod = section(sections, 'Fidelity Measurement Method');
    const description = section(sections, 'Description');
    const notes = section(sections, 'Notes');
    const paperUrl = section(sections, 'Paper/Preprint URL');
    const lambda1Source = section(sections, 'λ₁ Source');
    const teamRaw = section(sections, 'Team / Authors');
    const qasm = stripCodeFence(section(sections, 'QASM Circuit (Optional)'));

    if (qubitRangeMin !== null && qubitRangeMax !== null && qubitRangeMin > qubitRangeMax) {
        reject(errors, 'Qubit Range',
            `minimum ${qubitRangeMin} is greater than maximum ${qubitRangeMax}`, 'RANGE_INVERTED');
    }
    if (depthRangeMin !== null && depthRangeMax !== null && depthRangeMin > depthRangeMax) {
        reject(errors, 'Circuit Depth Range',
            `minimum ${depthRangeMin} is greater than maximum ${depthRangeMax}`, 'RANGE_INVERTED');
    }

    const nonlocal = buildNonlocalGame(sections, errors);

    const timestamp = meta.existingTimestamp || new Date().toISOString();
    const benchmark = {
        id: meta.dirName,
        algorithmName: algorithmName === null ? undefined : singleLine(algorithmName),
        device: device === null ? undefined : singleLine(device),
        metricName: metricName === null ? undefined : singleLine(metricName),
        metricValue: metricValue === null ? undefined : metricValue,
        timestamp: timestamp,
        lastUpdated: new Date().toISOString(),
        contributor: meta.author || undefined,
        paperUrl: paperUrl === null ? undefined : paperUrl
    };

    if (uncertainty !== null) {
        benchmark.uncertainty = uncertainty;
    }
    if (teamRaw !== null) {
        const team = teamRaw.split(',').map((name) => singleLine(name)).filter((name) => name !== '');
        if (team.length > 0) {
            benchmark.team = team;
        }
    }

    const quantumSpecific = {};
    if (qubitRangeMin !== null || qubitRangeMax !== null) {
        quantumSpecific.qubitRange = {
            min: qubitRangeMin === null ? qubitRangeMax : qubitRangeMin,
            max: qubitRangeMax === null ? qubitRangeMin : qubitRangeMax
        };
    }
    if (depthRangeMin !== null || depthRangeMax !== null) {
        quantumSpecific.depthRange = {
            min: depthRangeMin === null ? depthRangeMax : depthRangeMin,
            max: depthRangeMax === null ? depthRangeMin : depthRangeMax
        };
    }
    if (shots !== null) {
        quantumSpecific.shots = shots;
    }
    if (gateCount !== null) {
        quantumSpecific.gateCount = gateCount;
    }
    if (Object.keys(quantumSpecific).length > 0) {
        benchmark.quantumSpecific = quantumSpecific;
    }

    const generalMetrics = {};
    if (oneQubitFidelity !== null || twoQubitFidelity !== null || fidelityMeasurementMethod !== null) {
        generalMetrics.gateFidelity = {
            oneQubit: oneQubitFidelity === null ? undefined : oneQubitFidelity,
            twoQubit: twoQubitFidelity === null ? undefined : twoQubitFidelity,
            measurementMethod: fidelityMeasurementMethod === null ? undefined : fidelityMeasurementMethod
        };
    }
    if (qubitFidelity !== null) {
        generalMetrics.qubitFidelity = qubitFidelity;
    }
    if (readoutFidelity !== null) {
        generalMetrics.readoutFidelity = readoutFidelity;
    }
    if (lambda1 !== null) {
        generalMetrics.lambda1 = lambda1;
    }
    if (lambda1Source !== null) {
        generalMetrics.lambda1Source = lambda1Source.startsWith('explicit') ? 'explicit' : 'qasm';
    }
    if (qtvRaw !== null) {
        generalMetrics.qubitTimeVolume = qtvRaw;
    }
    if (qtvNorm !== null) {
        generalMetrics.qubitTimeVolumeNormalized = qtvNorm;
    }
    if (Object.keys(generalMetrics).length > 0) {
        benchmark.generalMetrics = generalMetrics;
    }

    const problemSpecific = {
        primaryMetric: {
            name: metricName === null ? undefined : singleLine(metricName),
            definition: primaryMetricDefinition === null ? undefined : primaryMetricDefinition,
            value: metricValue === null ? undefined : metricValue,
            uncertainty: uncertainty === null ? undefined : uncertainty,
            uncertaintyDefinition: uncertaintyDefinition === null ? undefined : uncertaintyDefinition
        },
        description: description === null ? undefined : description,
        shots: shots === null ? undefined : shots,
        notes: notes === null ? undefined : notes
    };
    if (quantumSpecific.qubitRange) {
        problemSpecific.qubitRange = quantumSpecific.qubitRange;
    }
    if (quantumSpecific.depthRange) {
        problemSpecific.depthRange = quantumSpecific.depthRange;
    }
    benchmark.problemSpecific = problemSpecific;

    if (circuitDuration !== null || t1 !== null || t2 !== null) {
        benchmark.timing = {
            unit: 'us',
            circuitDuration: circuitDuration === null ? undefined : circuitDuration,
            t1: t1 === null ? undefined : t1,
            t2: t2 === null ? undefined : t2
        };
    }

    if (qasm !== null) {
        benchmark.qasmFiles = ['circuit.qasm'];
    }
    if (nonlocal !== null) {
        benchmark.nonlocalGame = nonlocal.block;
    }

    return {
        benchmark: benchmark,
        qasm: qasm === null ? null : normalizeFileText(qasm),
        countsText: nonlocal === null ? null : nonlocal.countsText
    };
}

/**
 * Read the timestamp of a submission that already exists on the base branch.
 *
 * An edited issue rebuilds the folder, and the original submission time should survive that.
 *
 * @param {string} folderPath - Target submission folder.
 * @returns {string|null} The stored timestamp, or null.
 */
function existingTimestamp(folderPath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(folderPath, 'benchmark.json'), 'utf8'));
        return typeof parsed.timestamp === 'string' ? parsed.timestamp : null;
    } catch (error) {
        return null;
    }
}

/**
 * Write the submission into a directory.
 *
 * @param {string} folderPath - Directory to create and fill.
 * @param {Object} built - Output of `buildBenchmark`.
 * @returns {void}
 */
function writeSubmission(folderPath, built) {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'benchmark.json'),
        `${JSON.stringify(built.benchmark, null, 2)}\n`);
    if (built.countsText !== null) {
        fs.writeFileSync(path.join(folderPath, 'counts.json'), built.countsText);
    }
    if (built.qasm !== null) {
        fs.writeFileSync(path.join(folderPath, 'circuit.qasm'), built.qasm);
    }
}

/**
 * Make a string safe inside a Markdown table cell.
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
 * Render the report posted back on the issue.
 *
 * @param {Object} outcome - `{ok, dirName, errors, warnings, verification}`.
 * @returns {string} Markdown document.
 */
function buildReport(outcome) {
    const lines = [];

    if (outcome.ok) {
        lines.push('## ✅ Submission accepted', '',
            `Your entry was written to \`submissions/${cell(outcome.dirName)}/\` and checked ` +
            'against the schema' + (outcome.verification ? ', with its win rate recomputed from ' +
                'the counts you supplied.' : '.'), '');
    } else {
        lines.push('## ❌ Submission not accepted', '',
            'Nothing was written and no pull request was opened. Edit this issue to correct the ' +
            'points below and the bot will try again.', '');
    }

    if (outcome.errors.length > 0) {
        lines.push('### Errors', '', '| Field | Problem |', '| --- | --- |');
        outcome.errors.forEach((error) => {
            lines.push(`| \`${cell(error.field)}\` | ${cell(error.message)} |`);
        });
        lines.push('');
    }

    if (outcome.warnings.length > 0) {
        lines.push('### Warnings', '');
        outcome.warnings.forEach((warning) => {
            lines.push(`- \`${cell(warning.field)}\`: ${cell(warning.message)}`);
        });
        lines.push('');
    }

    const verification = outcome.verification;
    if (verification) {
        lines.push('### Recomputed from your counts', '');
        const winRate = verification.winRate || {};
        lines.push(`Status: **${cell(verification.status)}**. Ranked: \`${verification.ranked === true}\`.`, '');
        lines.push('| Quantity | Value |', '| --- | --- |',
            `| Game | \`${cell(verification.game ? verification.game.id : null)}\` |`,
            `| Claimed win rate | ${cell(winRate.claimed)} |`,
            `| Recomputed win rate | ${cell(winRate.recomputedMean)} |`,
            `| Difference | ${cell(winRate.delta)} |`, '');
        if (Array.isArray(verification.checks) && verification.checks.length > 0) {
            lines.push('| Check | Status | Detail |', '| --- | --- | --- |');
            verification.checks.forEach((check) => {
                lines.push(`| \`${cell(check.id)}\` | ${cell(check.status)} | ${cell(check.message)} |`);
            });
            lines.push('');
        }
    }

    lines.push('---', '',
        'This route accepts a pasted counts document. A submission whose counts do not fit, or one ' +
        'that ships several circuits, goes through a pull request instead: see ' +
        '`submissions/README.md` and `docs/verification.md`.', '');

    return lines.join('\n');
}

/**
 * Report that the parser itself failed.
 *
 * @param {Error} error - The thrown error.
 * @returns {string} Markdown document.
 */
function buildCrashReport(error) {
    return [
        '## ❌ Submission could not be processed',
        '',
        'The bot failed before it could judge this submission, so this is a fault in the bot rather ' +
        'than a verdict on your entry. A maintainer needs to look at the workflow run.',
        '',
        '```',
        String(error && error.stack ? error.stack : error).replace(/```/g, "'''"),
        '```',
        ''
    ].join('\n');
}

/**
 * Append a `key=value` line to a GitHub Actions exchange file, when one is configured.
 *
 * Every value written here is single line by construction.
 *
 * @param {string|undefined} file - Path from the environment.
 * @param {string} key - Variable name.
 * @param {string} value - Single-line value.
 * @returns {void}
 */
function appendKeyValue(file, key, value) {
    if (typeof file !== 'string' || file === '') {
        return;
    }
    fs.appendFileSync(file, `${key}=${String(value).replace(/[\r\n]+/g, ' ')}\n`);
}

/**
 * Build the submission, check it, and write it only if it passed.
 *
 * @param {Object} env - Environment to read.
 * @returns {Object} `{ok, dirName, algorithmName, hasCounts, errors, warnings, verification}`.
 */
function processIssue(env) {
    const errors = [];
    const warnings = [];
    const empty = {
        ok: false,
        dirName: '',
        algorithmName: '',
        hasCounts: false,
        errors: errors,
        warnings: warnings,
        verification: null
    };

    const issueNumber = Number(env.ISSUE_NUMBER);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
        reject(errors, 'issue', 'the workflow did not supply a usable issue number',
            'ISSUE_NUMBER_INVALID');
        return empty;
    }
    if (typeof env.ISSUE_BODY !== 'string' || env.ISSUE_BODY.trim() === '') {
        reject(errors, 'issue', 'the issue body is empty, so there is no submission to read',
            'ISSUE_BODY_EMPTY');
        return empty;
    }

    const sections = parseSections(env.ISSUE_BODY);
    const algorithmName = section(sections, 'Algorithm Name');
    const dirName = algorithmName === null
        ? null
        : submissionFolderName(algorithmName, issueNumber, errors);

    if (dirName === null) {
        if (algorithmName === null) {
            reject(errors, 'Algorithm Name', 'required', 'FIELD_REQUIRED');
        }
        return empty;
    }

    const submissionsDir = typeof env.QDB_SUBMISSIONS_DIR === 'string' && env.QDB_SUBMISSIONS_DIR !== ''
        ? path.resolve(env.QDB_SUBMISSIONS_DIR)
        : DEFAULT_SUBMISSIONS_DIR;
    const targetPath = path.join(submissionsDir, dirName);

    const built = buildBenchmark(sections, {
        dirName: dirName,
        issueNumber: issueNumber,
        author: typeof env.ISSUE_AUTHOR === 'string' ? env.ISSUE_AUTHOR : null,
        existingTimestamp: existingTimestamp(targetPath)
    }, errors);

    const outcome = {
        ok: false,
        dirName: dirName,
        algorithmName: singleLine(algorithmName),
        hasCounts: built.countsText !== null,
        errors: errors,
        warnings: warnings,
        verification: null
    };

    if (errors.length > 0) {
        return outcome;
    }

    // Check a throwaway copy first. The real schema and the real verifier decide, and they decide
    // before anything lands under submissions/, so a submission that cannot verify never becomes a
    // pull request that is certain to fail the gate.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'qdb-issue-'));
    let validation;
    try {
        const stagedFolder = path.join(staging, dirName);
        writeSubmission(stagedFolder, built);
        validation = validateBenchmarkFile(path.join(stagedFolder, 'benchmark.json'), dirName);
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }

    validation.errors.forEach((error) => {
        reject(errors, error.field, error.message, error.code || 'SCHEMA');
    });
    validation.warnings.forEach((warning) => {
        warnings.push({ field: warning.field, message: warning.message });
    });
    outcome.verification = validation.verification || null;

    if (!validation.valid) {
        return outcome;
    }

    writeSubmission(targetPath, built);
    outcome.ok = true;
    return outcome;
}

/**
 * Entry point.
 *
 * @param {Object} [env] - Environment to read. Defaults to `process.env`.
 * @returns {number} Process exit code.
 */
function main(env) {
    const environment = env || process.env;
    const reportPath = typeof environment.QDB_SUBMISSION_REPORT === 'string' && environment.QDB_SUBMISSION_REPORT !== ''
        ? path.resolve(environment.QDB_SUBMISSION_REPORT)
        : DEFAULT_REPORT_PATH;

    let outcome;
    let markdown;
    try {
        outcome = processIssue(environment);
        markdown = buildReport(outcome);
    } catch (error) {
        outcome = { ok: false, dirName: '', algorithmName: '', hasCounts: false };
        markdown = buildCrashReport(error);
        console.error(error);
    }

    fs.writeFileSync(reportPath, markdown);
    console.log(markdown);
    console.log(`\n📝 Wrote ${reportPath}`);

    appendKeyValue(environment.GITHUB_OUTPUT, 'ok', outcome.ok ? 'true' : 'false');
    appendKeyValue(environment.GITHUB_OUTPUT, 'dir_name', outcome.dirName);
    appendKeyValue(environment.GITHUB_OUTPUT, 'algorithm_name', outcome.algorithmName);
    appendKeyValue(environment.GITHUB_OUTPUT, 'has_counts', outcome.hasCounts ? 'true' : 'false');

    return outcome.ok ? 0 : 1;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = {
    MAX_COUNTS_CHARS,
    parseSections,
    section,
    stripCodeFence,
    parseGameParams,
    submissionFolderName,
    buildNonlocalGame,
    buildBenchmark,
    buildReport,
    processIssue,
    main
};
