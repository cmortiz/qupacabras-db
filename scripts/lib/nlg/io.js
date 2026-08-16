/**
 * Filesystem access for nonlocal-game verification.
 *
 * This is the only module in `scripts/lib/nlg/` that touches the disk, and it is the boundary
 * where a submitted string turns into a path. Two rules hold that boundary.
 *
 * 1. The counts file name is checked before the filesystem is touched, not after. The schema
 *    already constrains it to a bare `*.json`, but the schema may not have run: the generator
 *    reads submission folders directly, and a validation step can be skipped or reordered. So the
 *    name is rejected here for a path separator, a `..` segment, an absolute form or a drive
 *    prefix, and the resolved path is then confirmed to sit inside the submission folder. The
 *    override file goes through the same resolution, even though its name is a constant.
 * 2. Nothing throws for a problem the submitter caused. A missing file, an unreadable file,
 *    invalid JSON and a traversal attempt each return a distinct code, so a bad submission
 *    produces a report rather than a crashed build.
 *
 * `verifySubmissionFolder` returns `null` when the benchmark carries no `nonlocalGame` block.
 * That gate is not decoration. `src/__tests__/generate-benchmark-index.test.js` mocks `fs`
 * wholesale with `existsSync` returning `true`, so an ungated counts read would "find" a counts
 * file and be handed benchmark JSON back. Every counts read, and every override read, must sit
 * behind the gate.
 *
 * The override is the second thing this module does. A maintainer can accept a specific failure by
 * committing `submissions/<folder>/verify-override.json`, and it suppresses that failure only while
 * its `countsSha256` equals the digest of the counts file currently on disk. That is the whole
 * security property: an override approves one exact set of counts, not a folder, so swapping the
 * numbers in afterwards makes the override stale and brings the failure back. An override never
 * makes an entry `verified` and never makes it ranked.
 *
 * No file is read at module load time.
 */

const fs = require('fs');
const path = require('path');

const verify = require('./verify');

/** Stable codes for the load failures a submitter can cause. */
const IO_ERROR_CODES = Object.freeze({
    COUNTS_FILE_INVALID_NAME: 'COUNTS_FILE_INVALID_NAME',
    COUNTS_PATH_TRAVERSAL: 'COUNTS_PATH_TRAVERSAL',
    COUNTS_FILE_MISSING: 'COUNTS_FILE_MISSING',
    COUNTS_FILE_UNREADABLE: 'COUNTS_FILE_UNREADABLE',
    COUNTS_FILE_INVALID_JSON: 'COUNTS_FILE_INVALID_JSON'
});

/** Name of the committed file that records an accepted failure. */
const OVERRIDE_FILE = 'verify-override.json';

/**
 * Stable codes for override outcomes.
 *
 * Every one of them is a warning, never an error. An override that cannot be used leaves the
 * failure it was meant to accept exactly where it was, and an override that is used says so
 * loudly rather than quietly.
 */
const OVERRIDE_CODES = Object.freeze({
    OVERRIDE_APPLIED: 'OVERRIDE_APPLIED',
    OVERRIDE_STALE: 'OVERRIDE_STALE',
    OVERRIDE_INVALID: 'OVERRIDE_INVALID',
    OVERRIDE_INVALID_JSON: 'OVERRIDE_INVALID_JSON',
    OVERRIDE_UNREADABLE: 'OVERRIDE_UNREADABLE',
    OVERRIDE_PATH_TRAVERSAL: 'OVERRIDE_PATH_TRAVERSAL',
    OVERRIDE_UNUSED: 'OVERRIDE_UNUSED',
    OVERRIDE_NO_CLAIM: 'OVERRIDE_NO_CLAIM'
});

/** Name-resolution codes and message label for a submitted counts file name. */
const COUNTS_NAME_CODES = Object.freeze({
    invalidName: IO_ERROR_CODES.COUNTS_FILE_INVALID_NAME,
    traversal: IO_ERROR_CODES.COUNTS_PATH_TRAVERSAL,
    field: 'countsFile'
});

/** The same, for the override file. Its name is a constant, so these can only fire defensively. */
const OVERRIDE_NAME_CODES = Object.freeze({
    invalidName: OVERRIDE_CODES.OVERRIDE_INVALID,
    traversal: OVERRIDE_CODES.OVERRIDE_PATH_TRAVERSAL,
    field: OVERRIDE_FILE
});

/** A sha-256 digest as this repository writes it: 64 lowercase hex characters, nothing else. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** An ISO 8601 date, optionally carrying a time. Deliberately loose about the time part. */
const ISO_8601_DATE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read an own property, ignoring anything inherited.
 *
 * Override documents are untrusted JSON. Reading through `hasOwnProperty` means a document
 * carrying `__proto__` contributes nothing but an ignored key.
 *
 * @param {Object} doc - Parsed document.
 * @param {string} key - Property name.
 * @returns {*} The own value, or `undefined`.
 */
function ownProperty(doc, key) {
    return Object.prototype.hasOwnProperty.call(doc, key) ? doc[key] : undefined;
}

/**
 * @param {string} code - Stable failure code.
 * @param {string} message - Human-readable description.
 * @returns {{ok: false, code: string, message: string}} A load failure.
 */
function failure(code, message) {
    return { ok: false, code: code, message: message };
}

/**
 * @param {string} field - Path into the submission.
 * @param {string} message - Human-readable description.
 * @param {string} code - Stable machine-readable code.
 * @returns {{field: string, message: string, code: string}} The issue record.
 */
function issue(field, message, code) {
    return { field: field, message: message, code: code };
}

/**
 * Resolve a file name inside a submission folder, rejecting anything that could name a file
 * outside it.
 *
 * The name checks run entirely on the string, before any filesystem call, so a traversal attempt
 * never reaches `existsSync` or `readFileSync`. Both the submitter-supplied counts file name and
 * the fixed override file name go through this. The override name is a constant today, and this is
 * what keeps that from mattering if it ever stops being one.
 *
 * @param {*} folderPath - Path to the submission folder.
 * @param {*} fileName - File name, treated as untrusted.
 * @param {{invalidName: string, traversal: string, field: string}} codes - Codes to report under,
 *   and the label messages refer to the name by.
 * @returns {{ok: true, target: string}|{ok: false, code: string, message: string}} The absolute
 *   path, or a distinct rejection.
 */
function resolveInFolder(folderPath, fileName, codes) {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
        return failure(codes.invalidName, 'folderPath must be a non-empty path');
    }
    if (typeof fileName !== 'string' || fileName.length === 0) {
        return failure(codes.invalidName, codes.field + ' must be a non-empty file name');
    }
    if (fileName.indexOf('/') !== -1 || fileName.indexOf('\\') !== -1) {
        return failure(codes.traversal,
            codes.field + ' "' + fileName + '" contains a path separator; it must be a bare file ' +
                'name inside the submission folder');
    }
    if (fileName === '.' || fileName === '..' || fileName.indexOf('..') !== -1) {
        return failure(codes.traversal,
            codes.field + ' "' + fileName + '" contains a parent-directory reference');
    }
    if (fileName.indexOf('\0') !== -1) {
        return failure(codes.invalidName, codes.field + ' contains a null byte');
    }
    if (path.isAbsolute(fileName) || /^[A-Za-z]:/.test(fileName)) {
        return failure(codes.traversal, codes.field + ' "' + fileName + '" is an absolute path');
    }

    const folder = path.resolve(folderPath);
    const target = path.resolve(folder, fileName);
    // Belt and braces: the name checks above already forbid separators, so this can only fire if
    // they are ever loosened. The trailing separator stops "/subs/a-evil" passing as "/subs/a".
    if (target !== folder && !target.startsWith(folder + path.sep)) {
        return failure(codes.traversal,
            codes.field + ' "' + fileName + '" resolves outside the submission folder');
    }

    return { ok: true, target: target };
}

/**
 * Read and parse a counts file from inside a submission folder.
 *
 * @param {string} folderPath - Absolute or relative path to the submission folder.
 * @param {string} countsFile - Bare file name from `nonlocalGame.countsFile`, untrusted.
 * @returns {{ok: true, doc: *, raw: string, absolutePath: string, sha256: string}
 *   |{ok: false, code: string, message: string}} The parsed document, or a distinct failure.
 */
function loadCountsFile(folderPath, countsFile) {
    const resolved = resolveInFolder(folderPath, countsFile, COUNTS_NAME_CODES);
    if (resolved.ok !== true) {
        return resolved;
    }
    const target = resolved.target;

    let raw;
    try {
        raw = fs.readFileSync(target, 'utf8');
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return failure(IO_ERROR_CODES.COUNTS_FILE_MISSING,
                'counts file "' + countsFile + '" not found in the submission folder');
        }
        return failure(IO_ERROR_CODES.COUNTS_FILE_UNREADABLE,
            'counts file "' + countsFile + '" could not be read: ' + String(error && error.message));
    }

    let doc;
    try {
        doc = JSON.parse(raw);
    } catch (error) {
        return failure(IO_ERROR_CODES.COUNTS_FILE_INVALID_JSON,
            'counts file "' + countsFile + '" is not valid JSON: ' + String(error && error.message));
    }

    return {
        ok: true,
        doc: doc,
        raw: raw,
        absolutePath: target,
        sha256: verify.sha256Hex(raw)
    };
}

/* ------------------------------------------------------------------ *
 * Overrides
 * ------------------------------------------------------------------ */

/**
 * Whether a path that resolved inside a folder actually points somewhere else.
 *
 * `path.resolve` works on the string; a symbolic link is followed by the read that comes after it.
 * Comparing the resolved real paths closes that gap.
 *
 * @param {string} folderPath - Submission folder.
 * @param {string} target - Path that was read.
 * @returns {string|null} Where the target really is, when that is outside the folder, else `null`.
 */
function linkedOutsideFolder(folderPath, target) {
    let realTarget;
    let realFolder;
    try {
        realTarget = fs.realpathSync(target);
        realFolder = fs.realpathSync(path.resolve(folderPath));
    } catch (error) {
        // A path that cannot be resolved is reported as a link out, which refuses rather than
        // trusts it.
        return String(error && error.message);
    }
    if (realTarget === path.join(realFolder, path.basename(target))) {
        return null;
    }
    return realTarget;
}

/**
 * Check an override document's five required fields.
 *
 * Every rule here exists to keep a malformed file from suppressing anything. A file that cannot be
 * read as an approval by a named person, of a named digest, on a named pull request, is not an
 * approval, and the failure it was written for stands.
 *
 * @param {*} doc - Parsed override document, untrusted.
 * @returns {string|null} A description of everything wrong with it, or `null` when it is usable.
 */
function describeOverrideProblems(doc) {
    if (!isPlainObject(doc)) {
        return 'the file must contain a JSON object';
    }

    const problems = [];
    const reason = ownProperty(doc, 'reason');
    const approvedBy = ownProperty(doc, 'approvedBy');
    const approvedAt = ownProperty(doc, 'approvedAt');
    const pr = ownProperty(doc, 'pr');
    const countsSha256 = ownProperty(doc, 'countsSha256');

    if (typeof reason !== 'string' || reason.trim().length === 0) {
        problems.push('"reason" must be a non-empty string saying why the failure is accepted');
    }
    if (typeof approvedBy !== 'string' || approvedBy.trim().length === 0) {
        problems.push('"approvedBy" must be a non-empty string naming the approver');
    }
    if (typeof approvedAt !== 'string' || !ISO_8601_DATE.test(approvedAt) ||
        !Number.isFinite(Date.parse(approvedAt))) {
        problems.push('"approvedAt" must be an ISO 8601 timestamp such as "2026-08-22T14:31:00Z"');
    }
    if (typeof pr !== 'number' || !Number.isInteger(pr) || pr <= 0) {
        problems.push('"pr" must be a positive integer pull request number');
    }
    if (typeof countsSha256 !== 'string' || !SHA256_HEX.test(countsSha256)) {
        problems.push('"countsSha256" must be 64 lowercase hex characters, the sha256 of the raw ' +
            'bytes of the counts file being approved');
    }

    return problems.length === 0 ? null : problems.join('; ');
}

/**
 * Read, parse and check `verify-override.json` in a submission folder.
 *
 * Only the five known fields are carried out of the document, so nothing else a submitter wrote
 * reaches the published verification block.
 *
 * @param {string} folderPath - Path to the submission folder.
 * @returns {{present: false}
 *   |{present: true, ok: false, code: string, message: string}
 *   |{present: true, ok: true, override: Object, raw: string, absolutePath: string}} What is there.
 */
function loadOverrideFile(folderPath) {
    // A folder path this module cannot use is not evidence of an override, so it reports none
    // rather than inventing a malformed one.
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
        return { present: false };
    }

    const resolved = resolveInFolder(folderPath, OVERRIDE_FILE, OVERRIDE_NAME_CODES);
    if (resolved.ok !== true) {
        return { present: true, ok: false, code: resolved.code, message: resolved.message };
    }
    const target = resolved.target;

    let raw;
    try {
        raw = fs.readFileSync(target, 'utf8');
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return { present: false };
        }
        return {
            present: true,
            ok: false,
            code: OVERRIDE_CODES.OVERRIDE_UNREADABLE,
            message: 'it could not be read: ' + String(error && error.message)
        };
    }

    // The name check cannot escape the folder, but a symbolic link can. An override has to be the
    // file itself, so that a folder cannot borrow an approval written for something else.
    const escaped = linkedOutsideFolder(folderPath, target);
    if (escaped !== null) {
        return {
            present: true,
            ok: false,
            code: OVERRIDE_CODES.OVERRIDE_PATH_TRAVERSAL,
            message: 'it is a link to "' + escaped + '" rather than a file in the submission ' +
                'folder'
        };
    }

    let doc;
    try {
        doc = JSON.parse(raw);
    } catch (error) {
        return {
            present: true,
            ok: false,
            code: OVERRIDE_CODES.OVERRIDE_INVALID_JSON,
            message: 'it is not valid JSON: ' + String(error && error.message)
        };
    }

    const problems = describeOverrideProblems(doc);
    if (problems !== null) {
        return {
            present: true,
            ok: false,
            code: OVERRIDE_CODES.OVERRIDE_INVALID,
            message: problems
        };
    }

    return {
        present: true,
        ok: true,
        raw: raw,
        absolutePath: target,
        override: {
            reason: doc.reason,
            approvedBy: doc.approvedBy,
            approvedAt: doc.approvedAt,
            pr: doc.pr,
            countsSha256: doc.countsSha256
        }
    };
}

/**
 * Blank override record, the shape published inside `verification.override`.
 *
 * @param {string|null} actualSha256 - Digest of the counts file on disk, when it could be read.
 * @returns {Object} A fresh, plain, serializable record.
 */
function emptyOverrideRecord(actualSha256) {
    return {
        present: true,
        applied: false,
        status: 'ignored',
        reason: null,
        approvedBy: null,
        approvedAt: null,
        pr: null,
        hashMatched: false,
        expectedSha256: null,
        actualSha256: typeof actualSha256 === 'string' ? actualSha256 : null,
        message: '',
        suppressed: []
    };
}

/**
 * Publish an override record on the verification block and warn about it.
 *
 * Every outcome is warned about, an applied override included. Transparency is the point: an
 * override that nobody can see is indistinguishable from a verifier that silently stopped working.
 *
 * @param {Object|null} result - Verification result to annotate, or `null` when there is none.
 * @param {Object} record - The override record.
 * @param {string} code - One of `OVERRIDE_CODES`.
 * @returns {Object} The record, for the caller to return.
 */
function recordOverride(result, record, code) {
    if (isPlainObject(result)) {
        if (isPlainObject(result.verification)) {
            result.verification.override = record;
        }
        if (Array.isArray(result.warnings)) {
            result.warnings.push(issue('verifyOverride', record.message, code));
        }
    }
    return record;
}

/**
 * Apply any `verify-override.json` in a submission folder to a verification result.
 *
 * An override suppresses a failure only when its `countsSha256` equals the digest of the counts
 * file currently on disk. Nothing else it says can change that: a matching digest is the one thing
 * a submitter cannot produce for counts the approver never saw. Edit the counts after approval and
 * the digest goes stale, the override stops suppressing, and the failure comes back.
 *
 * Applying one never sets `status` to `'verified'` and never sets `ranked`. The entry is published
 * as `'overridden'`: unverified, unranked, and carrying the approver, the pull request, the reason
 * and the digest that was accepted.
 *
 * @param {string} folderPath - Path to the submission folder.
 * @param {Object|null} result - Result from `verifyNonlocalGame`, mutated in place, or `null` when
 *   the submission carries no `nonlocalGame` block and so has no failure to accept.
 * @param {string|null} countsSha256 - Digest of the raw counts bytes on disk, or `null` when the
 *   counts file could not be read.
 * @returns {Object|null} The override record, or `null` when the folder carries no override.
 */
function applyOverride(folderPath, result, countsSha256) {
    const loaded = loadOverrideFile(folderPath);
    if (loaded.present !== true) {
        return null;
    }

    const record = emptyOverrideRecord(countsSha256);

    if (loaded.ok !== true) {
        record.status = 'invalid';
        record.message = OVERRIDE_FILE + ' was ignored: ' + loaded.message +
            '. The failure it was written for stands.';
        return recordOverride(result, record, loaded.code);
    }

    const override = loaded.override;
    record.reason = override.reason;
    record.approvedBy = override.approvedBy;
    record.approvedAt = override.approvedAt;
    record.pr = override.pr;
    record.expectedSha256 = override.countsSha256;

    if (!isPlainObject(result)) {
        record.status = 'no-claim';
        record.message = OVERRIDE_FILE + ' was ignored: the submission carries no nonlocalGame ' +
            'block, so nothing was verified and there is no failure to accept. Remove the file.';
        return recordOverride(result, record, OVERRIDE_CODES.OVERRIDE_NO_CLAIM);
    }

    if (record.actualSha256 === null) {
        record.status = 'stale';
        record.message = OVERRIDE_FILE + ' was ignored: the counts file could not be read, so the ' +
            'approved digest ' + record.expectedSha256 + ' could not be checked against it.';
        return recordOverride(result, record, OVERRIDE_CODES.OVERRIDE_STALE);
    }

    record.hashMatched = record.expectedSha256 === record.actualSha256;
    if (!record.hashMatched) {
        record.status = 'stale';
        record.message = OVERRIDE_FILE + ' was ignored: it approves counts with sha256 ' +
            record.expectedSha256 + ', but the counts file on disk hashes to ' +
            record.actualSha256 + '. The counts changed after the override was approved, so the ' +
            'failure stands.';
        return recordOverride(result, record, OVERRIDE_CODES.OVERRIDE_STALE);
    }

    const failed = result.valid === false ||
        (isPlainObject(result.verification) && result.verification.status === 'failed');
    if (!failed) {
        record.status = 'unused';
        record.message = OVERRIDE_FILE + ' matches the counts on disk, but the submission passes ' +
            'verification and there is no failure to accept. The file is dead weight; remove it.';
        return recordOverride(result, record, OVERRIDE_CODES.OVERRIDE_UNUSED);
    }

    record.applied = true;
    record.status = 'applied';
    record.suppressed = result.errors.map(function copy(error) {
        return issue(error.field, error.message, error.code);
    });
    record.message = OVERRIDE_FILE + ' accepted ' + record.suppressed.length +
        ' verification failure(s), approved by ' + override.approvedBy + ' in PR #' + override.pr +
        ' on ' + override.approvedAt + ': "' + override.reason +
        '". The entry is published unverified and unranked.';
    recordOverride(result, record, OVERRIDE_CODES.OVERRIDE_APPLIED);

    // The suppressed errors keep their fields and codes and become warnings, so every surface that
    // renders warnings still shows what failed. Nothing is deleted, only reclassified.
    const prefix = 'suppressed by ' + OVERRIDE_FILE + ' (approved by ' + override.approvedBy +
        ' in PR #' + override.pr + '): ';
    record.suppressed.forEach(function warn(error) {
        result.warnings.push(issue(error.field, prefix + error.message, error.code));
    });

    result.errors = [];
    result.valid = true;
    result.verification.status = 'overridden';
    result.verification.ranked = false;
    return record;
}

/**
 * Verify one submission folder.
 *
 * @param {string} folderPath - Path to the submission folder.
 * @param {Object} benchmark - Parsed `benchmark.json`.
 * @param {Object} [options] - Passed through to `verifyNonlocalGame`.
 * @returns {{valid: boolean, errors: Array, warnings: Array, verification: Object}|null} The
 *   verification result, or `null` when the benchmark carries no `nonlocalGame` block and there
 *   is nothing to verify.
 */
function verifySubmissionFolder(folderPath, benchmark, options) {
    if (!isPlainObject(benchmark) || !isPlainObject(benchmark.nonlocalGame)) {
        return null;
    }

    const settings = isPlainObject(options) ? options : {};
    const loaded = loadCountsFile(folderPath, benchmark.nonlocalGame.countsFile);

    if (loaded.ok !== true) {
        const result = verify.verifyNonlocalGame(benchmark, null, settings);
        result.valid = false;
        result.errors.unshift({
            field: 'nonlocalGame.countsFile',
            message: loaded.message,
            code: loaded.code
        });
        result.verification.status = 'failed';
        result.verification.ranked = false;
        applyOverride(folderPath, result, null);
        return result;
    }

    const merged = Object.assign({}, settings, { countsSha256: loaded.sha256 });
    const result = verify.verifyNonlocalGame(benchmark, loaded.doc, merged);
    applyOverride(folderPath, result, loaded.sha256);
    return result;
}

module.exports = {
    IO_ERROR_CODES: IO_ERROR_CODES,
    OVERRIDE_CODES: OVERRIDE_CODES,
    OVERRIDE_FILE: OVERRIDE_FILE,
    loadCountsFile: loadCountsFile,
    loadOverrideFile: loadOverrideFile,
    applyOverride: applyOverride,
    verifySubmissionFolder: verifySubmissionFolder,
    sha256Hex: verify.sha256Hex
};
