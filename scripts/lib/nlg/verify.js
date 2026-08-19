/**
 * Recomputation of a nonlocal-game claim from its raw per-question counts.
 *
 * A submission stores a win rate. This module recomputes that win rate from the measurement
 * counts behind it and reports whether the two agree, so the stored number becomes a calculation
 * that anyone can repeat rather than an assertion that has to be trusted.
 *
 * Five checks run, each with a stable id on `CHECK_IDS`.
 *
 *   STRUCTURE      the counts document matches the game: version, questions, key widths, counts,
 *                  and a constant shot count per question
 *   WIN_RATE       the recomputed rate matches the claimed one
 *   UNCERTAINTY    the recomputed confidence half-width matches the claimed one
 *   NON_SIGNALING  each player's marginal outcome distribution is independent of the other
 *                  player's question
 *   SUPERQUANTUM   the observed rate does not exceed the game's quantum value
 *
 * The submitted document is never trusted to describe itself. In particular a `verification`
 * block on the benchmark is never read: this module computes its own and returns it, so a
 * submitter cannot ship `"status": "verified"` and have it believed.
 *
 * No file is read at module load time.
 */

const crypto = require('node:crypto');

const registry = require('./registry');
const stats = require('./stats');
const { chiSquareIndependence } = require('./chi-square');
const counts = require('./counts');

/**
 * Version of the verification block's own format and semantics. Bump it when the meaning of a
 * field or a check changes, so a stored block can be told apart from one this code would produce.
 */
const VERIFIER_VERSION = 1;

/** Stable check identifiers. Consumers filter and label on these, not on message text. */
const CHECK_IDS = Object.freeze({
    STRUCTURE: 'STRUCTURE',
    WIN_RATE: 'WIN_RATE',
    UNCERTAINTY: 'UNCERTAINTY',
    NON_SIGNALING: 'NON_SIGNALING',
    SUPERQUANTUM: 'SUPERQUANTUM'
});

/** Stable codes for the issues this module raises directly. Counts codes come from `counts.js`. */
const VERIFY_ERROR_CODES = Object.freeze({
    NO_NONLOCAL_GAME: 'NO_NONLOCAL_GAME',
    BAD_NONLOCAL_GAME: 'BAD_NONLOCAL_GAME',
    UNKNOWN_GAME: 'UNKNOWN_GAME',
    BAD_PARAM: 'BAD_PARAM',
    SHOTS_MISMATCH: 'SHOTS_MISMATCH',
    SHOTS_DECLARED_MISMATCH: 'SHOTS_DECLARED_MISMATCH',
    NO_SHOTS: 'NO_SHOTS',
    WIN_RATE_MISSING: 'WIN_RATE_MISSING',
    WIN_RATE_MISMATCH: 'WIN_RATE_MISMATCH',
    WIN_RATE_DRIFT: 'WIN_RATE_DRIFT',
    METRIC_VALUE_MISMATCH: 'METRIC_VALUE_MISMATCH',
    UNCERTAINTY_MISMATCH: 'UNCERTAINTY_MISMATCH',
    UNCERTAINTY_DRIFT: 'UNCERTAINTY_DRIFT',
    NON_SIGNALING_VIOLATION: 'NON_SIGNALING_VIOLATION',
    SUPERQUANTUM: 'SUPERQUANTUM'
});

/**
 * Absolute tolerance on `nonlocalGame.winRate`, the authoritative full-precision claim. A
 * disagreement above this is an error: it is far larger than any plausible rounding of a value
 * the submitter computed from the same counts.
 */
const WIN_RATE_ERROR_TOLERANCE = 1e-4;

/**
 * Absolute tolerance above which a `nonlocalGame.winRate` disagreement is worth a warning. An
 * exact recomputation reproduces the published corpus to 0.0, so anything above roughly a
 * double's resolution on a number near 1 means the claim was rounded or computed differently.
 */
const WIN_RATE_WARN_TOLERANCE = 1e-9;

/**
 * Floor under the rounding-aware tolerance on the top-level display value, so a submitter who
 * writes `metricValue` at full precision is not held to a tolerance below double resolution.
 */
const METRIC_DISPLAY_TOLERANCE_FLOOR = 1e-9;

/** Relative tolerances on a claimed `nonlocalGame.uncertainty`, with an absolute floor. */
const UNCERTAINTY_ERROR_RTOL = 1e-6;
const UNCERTAINTY_WARN_RTOL = 1e-9;
const UNCERTAINTY_ABS_FLOOR = 1e-12;

/**
 * Default significance level for the non-signaling chi-square.
 *
 * A submission produces one contingency table per question per player, so the order of a hundred
 * tests. `1e-3` is roughly a Bonferroni correction of a conventional `0.05` over that many tests.
 * It is only ever half of a trigger: see the effect-size threshold below.
 */
const DEFAULT_NON_SIGNALING_ALPHA = 1e-3;

/**
 * Default effect-size threshold on the largest total-variation distance.
 *
 * The p-value alone cannot decide this check. Measured on this repository's own published
 * hardware data the minimum p-value reaches 2e-146 with a maximum total-variation distance of
 * 0.388 against a shot-noise floor near 0.031, because the two players' circuits execute
 * separately and the statistic picks up drift and readout asymmetry rather than signaling
 * capacity. So an error needs both a small p-value and a large effect, and even then it ships
 * disabled: `options.nonSignalingError` must be exactly `true` for a violation to be an error
 * instead of a warning.
 */
const DEFAULT_MAX_TVD = 0.25;

/**
 * Number of standard errors above the quantum value at which a result is called impossible.
 *
 * Four is chosen over three because the check must not misfire on legitimate submissions: at
 * three standard errors the simulated false-positive rate reaches 8.5e-4, at four it is at most
 * 1e-5.
 */
const SUPERQUANTUM_SIGMA = 4;

/**
 * The likeliest cause of a real superquantum failure, named in the message.
 *
 * Since `games/odd-cycle.js` pins `cos^2(pi / (4n))`, this branch is reachable on a game the
 * hackathon uses, and the margin is narrow: at n = 3 with 1024 shots on each of 6 questions, four
 * standard errors is about 0.013 above a bound of 0.933. Hardware does not clear that. A question
 * set built under the wrong edge convention does, and nothing else in the submission looks wrong
 * when it happens, so the message has to say where to look. `odd-cycle` takes each cycle edge
 * ONCE in the orientation i -> i+1; `coloring` takes each edge in BOTH directions.
 */
const SUPERQUANTUM_CAUSE =
    '. A win rate this far above the bound is not a hardware result. The likeliest cause is that ' +
    'the questions were built under a different edge convention from the one this game fixes: ' +
    '"odd-cycle" takes each cycle edge once, in the orientation i -> i+1, while the coloring ' +
    'family takes each edge in both directions. Check the question set and the win rule against ' +
    'scripts/lib/nlg/games/README.md before changing anything else';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a finite number.
 */
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
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
 * SHA-256 of raw bytes, as lowercase hex.
 *
 * Hashing the raw file bytes rather than a re-serialization is what makes the digest useful as a
 * staleness check: an override that records the hash of the counts it approved stops matching the
 * moment the counts file is edited, whatever the edit does to the parsed value.
 *
 * @param {Buffer|Uint8Array|string} bytes - Raw content.
 * @returns {string} Lowercase hex digest.
 */
function sha256Hex(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Number of decimal places in a number's default string form.
 *
 * Exponential forms are handled, so `5e-7` reports 7 places rather than 0.
 *
 * @param {number} value - A finite number.
 * @returns {number} Decimal places implied by `String(value)`.
 */
function decimalPlaces(value) {
    const text = String(value);
    const exponentIndex = text.indexOf('e');
    if (exponentIndex === -1) {
        const dot = text.indexOf('.');
        return dot === -1 ? 0 : text.length - dot - 1;
    }
    const mantissa = text.slice(0, exponentIndex);
    const exponent = Number(text.slice(exponentIndex + 1));
    const dot = mantissa.indexOf('.');
    const mantissaPlaces = dot === -1 ? 0 : mantissa.length - dot - 1;
    return Math.max(0, mantissaPlaces - exponent);
}

/**
 * Rounding-aware tolerance for a displayed value.
 *
 * `metricValue` is what a table renders, and the published corpus writes it rounded: entries
 * claim `0.94` where the counts give `0.935882`. Holding a display value to full precision would
 * fail every one of those, so the tolerance is derived from how the number is written. Two
 * decimal places allow half a unit in the last place, `0.005`. The full-precision claim lives in
 * `nonlocalGame.winRate` and is checked tightly.
 *
 * @param {number} value - The displayed value.
 * @returns {number} Absolute tolerance.
 */
function displayTolerance(value) {
    return Math.max(0.5 * Math.pow(10, -decimalPlaces(value)), METRIC_DISPLAY_TOLERANCE_FLOOR);
}

/**
 * Format a number for a message without letting a long tail dominate it.
 *
 * @param {number|null} value - Value to render.
 * @returns {string} Rendered value, or `"n/a"` for `null`.
 */
function show(value) {
    if (value === null || value === undefined) {
        return 'n/a';
    }
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (value !== 0 && Math.abs(value) < 1e-4) {
        return value.toExponential(3);
    }
    return String(Number(value.toPrecision(12)));
}

/* ------------------------------------------------------------------ *
 * Check bookkeeping
 * ------------------------------------------------------------------ */

/**
 * Accumulates the five check records plus the flat error and warning lists.
 */
class CheckLog {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.checks = [];
    }

    /**
     * @param {string} id - One of `CHECK_IDS`.
     * @param {'pass'|'warn'|'fail'|'skip'} status - Outcome.
     * @param {string} message - One-line summary shown to a human.
     * @returns {void}
     */
    record(id, status, message) {
        this.checks.push({ id: id, status: status, message: message });
    }

    /**
     * @param {string} field - Path into the submission.
     * @param {string} message - Description.
     * @param {string} code - Stable code.
     * @returns {void}
     */
    error(field, message, code) {
        this.errors.push(issue(field, message, code));
    }

    /**
     * @param {string} field - Path into the submission.
     * @param {string} message - Description.
     * @param {string} code - Stable code.
     * @returns {void}
     */
    warn(field, message, code) {
        this.warnings.push(issue(field, message, code));
    }
}

/**
 * Blank verification block, filled in as the checks run.
 *
 * @param {number|null} schemaVersion - Declared counts schema version, when readable.
 * @param {string|null} countsSha256 - Digest of the raw counts bytes.
 * @returns {Object} A fresh, plain, serializable block.
 */
function emptyVerification(schemaVersion, countsSha256) {
    return {
        verifierVersion: VERIFIER_VERSION,
        schemaVersion: schemaVersion,
        status: 'unverified',
        ranked: false,
        game: null,
        winRate: {
            claimed: null,
            recomputedMean: null,
            recomputedPooled: null,
            delta: null,
            totalShots: 0,
            shotsPerCircuit: null,
            shotsMin: null,
            shotsMax: null,
            questions: 0
        },
        uncertainty: { claimed: null, recomputed: null, approximate: false },
        nonSignaling: { pValue: null, maxTvd: null, maxJsd: null, minExpected: null, df: null, groups: 0 },
        classical: { value: null, exceeded: false, sigma: null, pValue: null, pValueExact: null, certifiedPnl: null },
        checks: [],
        countsSha256: countsSha256
    };
}

/**
 * Describe a resolved game in plain serializable form.
 *
 * @param {Object} game - Resolved `NonlocalGameDef`.
 * @returns {Object} Summary for the verification block.
 */
function describeGame(game) {
    return {
        id: game.id,
        name: game.name,
        params: Object.assign({}, game.params),
        label: game.label,
        family: game.family,
        classicalValue: game.classicalValue,
        quantumValue: game.quantumValue,
        questions: game.questions.length
    };
}

/**
 * Resolve the digest of the counts file from the caller's options.
 *
 * @param {Object} options - Verification options.
 * @returns {string|null} Lowercase hex digest, or `null` when no raw bytes were supplied.
 */
function resolveDigest(options) {
    if (typeof options.countsSha256 === 'string') {
        return options.countsSha256;
    }
    if (typeof options.rawCounts === 'string' || Buffer.isBuffer(options.rawCounts) ||
        options.rawCounts instanceof Uint8Array) {
        return sha256Hex(options.rawCounts);
    }
    return null;
}

/* ------------------------------------------------------------------ *
 * Individual checks
 * ------------------------------------------------------------------ */

/**
 * Shot-count constancy, reported under STRUCTURE.
 *
 * The published win rate is an unweighted mean over questions and `stats.calculateCi` takes a
 * scalar shot count, so both are defined only when every question was run the same number of
 * times. Variable shots are therefore an error rather than a rounding concern, with
 * `allowVariableShots` as the documented escape that downgrades it to a warning and marks the
 * confidence interval approximate.
 *
 * @param {Object} context - Shared state: log, rates, declared shots, flags.
 * @returns {{shotsPerCircuit: number|null, shotsMin: number|null, shotsMax: number|null,
 *   approximate: boolean, failed: boolean}} Shot summary.
 */
function checkShots(context) {
    const log = context.log;
    const rates = context.rates;

    if (rates.questions === 0) {
        log.error('nonlocalGame.countsFile', 'no question carries any shots, so nothing can be recomputed',
            VERIFY_ERROR_CODES.NO_SHOTS);
        return { shotsPerCircuit: null, shotsMin: null, shotsMax: null, approximate: false, failed: true };
    }

    let shotsMin = Infinity;
    let shotsMax = 0;
    for (let i = 0; i < rates.perQuestion.length; i += 1) {
        const shots = rates.perQuestion[i].shots;
        if (shots < shotsMin) {
            shotsMin = shots;
        }
        if (shots > shotsMax) {
            shotsMax = shots;
        }
    }

    const declared = context.declaredShots;
    const constant = shotsMin === shotsMax;
    let failed = false;
    let approximate = false;

    if (!constant) {
        const message = 'per-question shot totals vary from ' + shotsMin + ' to ' + shotsMax +
            '; the win rate is an unweighted mean and the confidence interval takes a single shot ' +
            'count, so both are ill-defined here';
        if (context.allowVariableShots) {
            approximate = true;
            log.warn('nonlocalGame.shotsPerCircuit', message + ' (allowed by allowVariableShots)',
                VERIFY_ERROR_CODES.SHOTS_MISMATCH);
        } else {
            failed = true;
            log.error('nonlocalGame.shotsPerCircuit', message, VERIFY_ERROR_CODES.SHOTS_MISMATCH);
        }
    }

    if (isFiniteNumber(declared)) {
        if (constant && declared !== shotsMin) {
            failed = true;
            log.error('nonlocalGame.shotsPerCircuit',
                'declared shotsPerCircuit ' + declared + ' does not match the ' + shotsMin +
                    ' shots present in the counts',
                VERIFY_ERROR_CODES.SHOTS_DECLARED_MISMATCH);
        } else if (!constant && (declared < shotsMin || declared > shotsMax)) {
            log.warn('nonlocalGame.shotsPerCircuit',
                'declared shotsPerCircuit ' + declared + ' lies outside the observed range ' +
                    shotsMin + '..' + shotsMax,
                VERIFY_ERROR_CODES.SHOTS_DECLARED_MISMATCH);
        }
    }

    return {
        shotsPerCircuit: constant ? shotsMin : null,
        shotsMin: shotsMin,
        shotsMax: shotsMax,
        approximate: approximate,
        failed: failed
    };
}

/**
 * WIN_RATE: compare the recomputed rate against both the full-precision claim and the display
 * value.
 *
 * @param {Object} context - Shared state.
 * @param {Object} verification - Block being filled in.
 * @returns {void}
 */
function checkWinRate(context, verification) {
    const log = context.log;
    const rates = context.rates;
    const claimed = context.nonlocalGame.winRate;

    verification.winRate.recomputedMean = rates.winRateMean;
    verification.winRate.recomputedPooled = rates.winRatePooled;
    verification.winRate.totalShots = rates.totalShots;
    verification.winRate.questions = rates.questions;

    if (rates.winRateMean === null) {
        log.record(CHECK_IDS.WIN_RATE, 'skip', 'no counts to recompute a win rate from');
        return;
    }

    if (!isFiniteNumber(claimed)) {
        log.error('nonlocalGame.winRate', 'nonlocalGame.winRate is missing or not a finite number',
            VERIFY_ERROR_CODES.WIN_RATE_MISSING);
        log.record(CHECK_IDS.WIN_RATE, 'fail',
            'no claimed win rate to compare against; the counts give ' + show(rates.winRateMean));
        return;
    }

    verification.winRate.claimed = claimed;
    const delta = Math.abs(claimed - rates.winRateMean);
    verification.winRate.delta = delta;

    let status = 'pass';
    if (delta > WIN_RATE_ERROR_TOLERANCE) {
        status = 'fail';
        log.error('nonlocalGame.winRate',
            'claimed win rate ' + show(claimed) + ' differs from the value recomputed from the ' +
                'counts, ' + show(rates.winRateMean) + ', by ' + show(delta) + ' (tolerance ' +
                WIN_RATE_ERROR_TOLERANCE + ')',
            VERIFY_ERROR_CODES.WIN_RATE_MISMATCH);
    } else if (delta > WIN_RATE_WARN_TOLERANCE) {
        status = 'warn';
        log.warn('nonlocalGame.winRate',
            'claimed win rate ' + show(claimed) + ' differs from the recomputed ' +
                show(rates.winRateMean) + ' by ' + show(delta) +
                '; an exact recomputation agrees to the last bit',
            VERIFY_ERROR_CODES.WIN_RATE_DRIFT);
    }

    // The display value is a separate, looser claim. A mismatch there is still an error, because
    // it is the number a reader sees, but the tolerance follows how the number is written.
    const metricValue = context.benchmark.metricValue;
    if (isFiniteNumber(metricValue)) {
        const tolerance = displayTolerance(metricValue);
        const displayDelta = Math.abs(metricValue - rates.winRateMean);
        if (displayDelta > tolerance) {
            status = 'fail';
            log.error('metricValue',
                'displayed metricValue ' + String(metricValue) + ' differs from the recomputed ' +
                    'win rate ' + show(rates.winRateMean) + ' by ' + show(displayDelta) +
                    ', beyond the rounding tolerance ' + show(tolerance) + ' implied by writing it ' +
                    'to ' + decimalPlaces(metricValue) + ' decimal place(s)',
                VERIFY_ERROR_CODES.METRIC_VALUE_MISMATCH);
        }
    }

    const summary = 'recomputed mean ' + show(rates.winRateMean) + ' over ' + rates.questions +
        ' question(s), pooled ' + show(rates.winRatePooled) + ', claimed ' + show(claimed) +
        ', delta ' + show(delta);
    log.record(CHECK_IDS.WIN_RATE, status, summary);
}

/**
 * UNCERTAINTY: recompute the confidence half-width and compare it with any claimed value.
 *
 * An absent claim is not an error. The value is recomputed and reported either way, so a
 * submission that omits it still publishes a checked uncertainty.
 *
 * @param {Object} context - Shared state.
 * @param {Object} verification - Block being filled in.
 * @returns {void}
 */
function checkUncertainty(context, verification) {
    const log = context.log;
    const rates = context.rates;
    const claimed = context.nonlocalGame.uncertainty;

    if (rates.questions === 0) {
        log.record(CHECK_IDS.UNCERTAINTY, 'skip', 'no counts to recompute an uncertainty from');
        return;
    }

    // With variable shots there is no single shot count the estimator is defined for, so the mean
    // stands in and the result is flagged approximate rather than presented as exact.
    const shots = context.shots.shotsPerCircuit === null
        ? rates.totalShots / rates.questions
        : context.shots.shotsPerCircuit;

    const perQuestionRates = rates.perQuestion.map(function pick(entry) {
        return entry.winRate;
    });
    const recomputed = stats.calculateCi(perQuestionRates, shots);

    verification.uncertainty.recomputed = recomputed;
    verification.uncertainty.approximate = context.shots.approximate;

    if (!isFiniteNumber(claimed)) {
        log.record(CHECK_IDS.UNCERTAINTY, 'pass',
            'no uncertainty claimed; recomputed 95% half-width is ' + show(recomputed) +
                (context.shots.approximate ? ' (approximate, shot counts vary)' : ''));
        return;
    }

    verification.uncertainty.claimed = claimed;
    const delta = Math.abs(claimed - recomputed);
    const errorTolerance = Math.max(UNCERTAINTY_ERROR_RTOL * recomputed, UNCERTAINTY_ABS_FLOOR);
    const warnTolerance = Math.max(UNCERTAINTY_WARN_RTOL * recomputed, UNCERTAINTY_ABS_FLOOR);

    let status = 'pass';
    if (delta > errorTolerance) {
        status = 'fail';
        log.error('nonlocalGame.uncertainty',
            'claimed uncertainty ' + show(claimed) + ' differs from the recomputed ' +
                show(recomputed) + ' by ' + show(delta) + ' (tolerance ' + show(errorTolerance) + ')',
            VERIFY_ERROR_CODES.UNCERTAINTY_MISMATCH);
    } else if (delta > warnTolerance) {
        status = 'warn';
        log.warn('nonlocalGame.uncertainty',
            'claimed uncertainty ' + show(claimed) + ' differs from the recomputed ' +
                show(recomputed) + ' by ' + show(delta),
            VERIFY_ERROR_CODES.UNCERTAINTY_DRIFT);
    }

    log.record(CHECK_IDS.UNCERTAINTY, status,
        'recomputed ' + show(recomputed) + ', claimed ' + show(claimed) + ', delta ' + show(delta) +
            (context.shots.approximate ? ' (approximate, shot counts vary)' : ''));
}

/**
 * NON_SIGNALING: chi-square independence on each player's marginal contingency tables.
 *
 * Warning-only unless `options.nonSignalingError` is exactly `true`, and even then a violation
 * needs both a p-value below alpha and an effect size above the total-variation threshold. See
 * `DEFAULT_MAX_TVD` for why the p-value on its own is unusable here.
 *
 * @param {Object} context - Shared state.
 * @param {Object} verification - Block being filled in.
 * @returns {void}
 */
function checkNonSignaling(context, verification) {
    const log = context.log;
    const groups = counts.buildMarginalTables(context.normalized);

    let worst = null;
    let maxTvd = 0;
    let maxJsd = 0;
    let minExpected = null;
    let used = 0;

    for (let i = 0; i < groups.length; i += 1) {
        const result = chiSquareIndependence(groups[i].table);
        if (result.df < 1 || result.total === 0) {
            continue;
        }
        used += 1;
        if (worst === null || result.pValue < worst.pValue) {
            worst = result;
        }
        if (result.maxTvd > maxTvd) {
            maxTvd = result.maxTvd;
        }
        if (result.maxJsd > maxJsd) {
            maxJsd = result.maxJsd;
        }
        if (minExpected === null || result.minExpected < minExpected) {
            minExpected = result.minExpected;
        }
    }

    verification.nonSignaling.groups = used;

    if (worst === null) {
        log.record(CHECK_IDS.NON_SIGNALING, 'skip',
            'no marginal table pairs two of one player\'s questions against the other player');
        return;
    }

    verification.nonSignaling.pValue = worst.pValue;
    verification.nonSignaling.maxTvd = maxTvd;
    verification.nonSignaling.maxJsd = maxJsd;
    verification.nonSignaling.minExpected = minExpected;
    verification.nonSignaling.df = worst.df;

    const summary = 'min p = ' + show(worst.pValue) + ' at df ' + worst.df + ' over ' + used +
        ' marginal table(s), max total-variation distance ' + show(maxTvd) +
        ', max Jensen-Shannon divergence ' + show(maxJsd) +
        ', min expected cell ' + show(minExpected);

    if (worst.pValue >= context.alpha) {
        log.record(CHECK_IDS.NON_SIGNALING, 'pass', summary);
        return;
    }

    if (maxTvd <= context.maxTvd) {
        log.warn('nonlocalGame.countsFile',
            'marginal distributions depend on the other player\'s question (' + summary +
                '), but the effect is below the ' + context.maxTvd + ' total-variation threshold, ' +
                'which is what separate circuit execution and readout drift look like',
            VERIFY_ERROR_CODES.NON_SIGNALING_VIOLATION);
        log.record(CHECK_IDS.NON_SIGNALING, 'warn', summary);
        return;
    }

    const message = 'marginal distributions depend on the other player\'s question with a large ' +
        'effect (' + summary + '); on separately executed circuits this measures drift and readout ' +
        'asymmetry rather than signaling capacity';
    if (context.nonSignalingError) {
        log.error('nonlocalGame.countsFile', message, VERIFY_ERROR_CODES.NON_SIGNALING_VIOLATION);
        log.record(CHECK_IDS.NON_SIGNALING, 'fail', summary);
        return;
    }
    log.warn('nonlocalGame.countsFile', message, VERIFY_ERROR_CODES.NON_SIGNALING_VIOLATION);
    log.record(CHECK_IDS.NON_SIGNALING, 'warn', summary);
}

/**
 * SUPERQUANTUM, plus the classical-exceedance figures the leaderboard reports.
 *
 * The standard error is the binomial one on the POOLED rate over the total shot count,
 * `sqrt(p (1 - p) / N)`. The pooled rate is used rather than the per-question mean because the
 * quantity being bounded is a proportion of individual rounds, and every round is one Bernoulli
 * trial regardless of which question produced it. At the constant shot count this verifier
 * requires, the pooled rate and the mean coincide.
 *
 * The classical check computes three quantities. Each is computed here from the counts and never
 * read from the submission.
 *
 * `classical.sigma` is `(observed - classicalValue) / standardError`: a Gaussian-equivalent
 * z-score under an independent-Bernoulli null.
 *
 * `classical.pValue` is the quantity `stats.calculatePValue` returns: a Bernstein tail bound,
 * kept for exact reproducibility of the published corpus.
 *
 * `classical.pValueExact` is the quantity `stats.binomialTailPValue` returns: the exact binomial
 * upper tail on the pooled win count, the sharp bound the Bernstein one loosens. Its exactness
 * needs a constant shot count per question, so with variable shots it stays null rather than
 * pretending to a validity the data does not support.
 *
 * The three are different quantities and are kept apart rather than merged into one "sigma". A
 * user interface that labels the z-score as if it were a tail bound, or either bound as the
 * other, would overstate or misstate the claim.
 *
 * For odd-cycle games one more figure is derived: `classical.certifiedPnl`, the certified
 * nonlocal content `1 - 2n (1 - omegaLB)` where `omegaLB` is the Clopper-Pearson one-sided lower
 * bound on the win rate at the one-sided 3-sigma target and `n` is the game's cycle size. It is
 * a lower bound certified from the counts, not a submitted number, and it can be negative when
 * the counts certify nothing.
 *
 * @param {Object} context - Shared state.
 * @param {Object} verification - Block being filled in.
 * @returns {void}
 */
function checkSuperquantum(context, verification) {
    const log = context.log;
    const rates = context.rates;
    const game = context.game;

    verification.classical.value = game.classicalValue;

    if (rates.winRateMean === null) {
        log.record(CHECK_IDS.SUPERQUANTUM, 'skip', 'no counts to recompute a win rate from');
        return;
    }

    const observed = rates.winRateMean;
    const pooled = rates.winRatePooled;
    const standardError = rates.totalShots > 0
        ? Math.sqrt(pooled * (1 - pooled) / rates.totalShots)
        : 0;

    verification.classical.exceeded = observed > game.classicalValue;
    verification.classical.sigma = standardError > 0
        ? (observed - game.classicalValue) / standardError
        : null;

    const perQuestionRates = rates.perQuestion.map(function pick(entry) {
        return entry.winRate;
    });
    const shots = context.shots.shotsPerCircuit === null
        ? rates.totalShots / rates.questions
        : context.shots.shotsPerCircuit;
    verification.classical.pValue = stats.calculatePValue(
        perQuestionRates, shots, game.classicalValue
    );

    // The exact tail and the certified bound are defined on the pooled win count, which is a
    // binomial count of the mean win rate only at a constant integer shot count. See the doc
    // comment above: with variable shots both stay null.
    const constantShots = context.shots.shotsPerCircuit;
    if (Number.isSafeInteger(constantShots) && constantShots > 0) {
        verification.classical.pValueExact = stats.binomialTailPValue(
            perQuestionRates, constantShots, game.classicalValue
        );
        if (game.family === 'odd-cycle' && isFiniteNumber(game.params.n)) {
            const omegaLB = stats.certifiedWinRateLowerBound(perQuestionRates, constantShots);
            verification.classical.certifiedPnl = 1 - 2 * game.params.n * (1 - omegaLB);
        }
    }

    const degraded = game.quantumValue === null;
    const bound = degraded ? 1 : game.quantumValue;

    let exceededBy;
    let violated;
    if (bound === 1) {
        // A win rate above 1 is arithmetically impossible, so no tolerance is warranted.
        exceededBy = observed - 1;
        violated = observed > 1;
    } else {
        exceededBy = observed - bound;
        violated = exceededBy > SUPERQUANTUM_SIGMA * standardError;
    }

    const boundText = degraded
        ? '1 (game "' + game.id + '" pins no quantum value, so the check degrades to "not above 1")'
        : String(bound);

    if (violated) {
        // The convention hint belongs only to a real quantum bound. Where the bound is 1 the
        // result is arithmetically impossible rather than physically impossible, and the cause is
        // the counts, not the question set.
        const cause = bound === 1 ? '' : SUPERQUANTUM_CAUSE;
        log.error('nonlocalGame.winRate',
            'recomputed win rate ' + show(observed) + ' exceeds the quantum bound ' + boundText +
                ' by ' + show(exceededBy) + ', more than ' + SUPERQUANTUM_SIGMA +
                ' standard errors (' + show(standardError) + ')' + cause,
            VERIFY_ERROR_CODES.SUPERQUANTUM);
        log.record(CHECK_IDS.SUPERQUANTUM, 'fail',
            'win rate ' + show(observed) + ' above the quantum bound ' + boundText +
                (bound === 1 ? '' : '; check the edge convention first'));
        return;
    }

    log.record(CHECK_IDS.SUPERQUANTUM, 'pass',
        'win rate ' + show(observed) + ' within the quantum bound ' + boundText +
            '; classical value ' + show(game.classicalValue) +
            (verification.classical.exceeded
                ? ' exceeded by ' + show(verification.classical.sigma) + ' standard errors'
                : ' not exceeded'));
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Verify a nonlocal-game submission by recomputing it from its counts.
 *
 * @param {Object} benchmark - Parsed `benchmark.json`. Any `verification` block it carries is
 *   ignored: this function computes its own.
 * @param {*} countsDoc - Parsed counts document, untrusted.
 * @param {Object} [options] - Verification options.
 * @param {string} [options.countsSha256] - Digest of the raw counts bytes, from `io.js`.
 * @param {Buffer|string} [options.rawCounts] - Raw counts bytes, hashed when no digest is given.
 * @param {boolean} [options.allowVariableShots] - Downgrade a shot mismatch to a warning. Also
 *   read from `benchmark.nonlocalGame.allowVariableShots`.
 * @param {boolean} [options.nonSignalingError] - Exactly `true` enables the non-signaling error
 *   path. Anything else keeps it warning-only.
 * @param {number} [options.alpha] - Non-signaling significance level.
 * @param {number} [options.maxTvd] - Non-signaling effect-size threshold.
 * @returns {{valid: boolean, errors: Array, warnings: Array, verification: Object}} Result, with
 *   `verification` a sibling of `errors` so the publishable summary survives flattening.
 */
function verifyNonlocalGame(benchmark, countsDoc, options) {
    const settings = isPlainObject(options) ? options : {};
    const log = new CheckLog();
    const digest = resolveDigest(settings);

    const nonlocalGame = isPlainObject(benchmark) ? benchmark.nonlocalGame : undefined;
    if (!isPlainObject(nonlocalGame)) {
        // Nothing to recompute. Reported as an error because the caller asked for a verification
        // that cannot exist, but the block stays `unverified` rather than `failed`: no claim was
        // checked and found wrong.
        const verification = emptyVerification(null, digest);
        log.error('nonlocalGame', 'no nonlocalGame block, so there is nothing to recompute',
            VERIFY_ERROR_CODES.NO_NONLOCAL_GAME);
        log.record(CHECK_IDS.STRUCTURE, 'skip', 'no nonlocalGame block');
        verification.checks = log.checks;
        return {
            valid: false,
            errors: log.errors,
            warnings: log.warnings,
            verification: verification
        };
    }

    let game;
    try {
        game = registry.getGame(nonlocalGame.game, nonlocalGame.params);
    } catch (error) {
        const verification = emptyVerification(null, digest);
        const code = error && typeof error.code === 'string'
            ? error.code
            : VERIFY_ERROR_CODES.BAD_NONLOCAL_GAME;
        log.error('nonlocalGame.game', error.message, code);
        log.record(CHECK_IDS.STRUCTURE, 'fail', error.message);
        return finish(log, verification, null);
    }

    const normalized = counts.normalizeCounts(countsDoc, game, settings);
    const verification = emptyVerification(normalized.schemaVersion, digest);
    verification.game = describeGame(game);
    verification.classical.value = game.classicalValue;

    for (let i = 0; i < normalized.errors.length; i += 1) {
        log.errors.push(normalized.errors[i]);
    }
    for (let i = 0; i < normalized.warnings.length; i += 1) {
        log.warnings.push(normalized.warnings[i]);
    }
    const structuralErrors = normalized.errors.length;

    const rates = counts.computeWinRates(normalized);

    const context = {
        benchmark: benchmark,
        nonlocalGame: nonlocalGame,
        game: game,
        normalized: normalized,
        rates: rates,
        log: log,
        declaredShots: nonlocalGame.shotsPerCircuit,
        allowVariableShots: settings.allowVariableShots === true ||
            nonlocalGame.allowVariableShots === true,
        nonSignalingError: settings.nonSignalingError === true,
        alpha: isFiniteNumber(settings.alpha) ? settings.alpha : DEFAULT_NON_SIGNALING_ALPHA,
        maxTvd: isFiniteNumber(settings.maxTvd) ? settings.maxTvd : DEFAULT_MAX_TVD,
        shots: null
    };

    context.shots = checkShots(context);
    verification.winRate.shotsPerCircuit = context.shots.shotsPerCircuit;
    verification.winRate.shotsMin = context.shots.shotsMin;
    verification.winRate.shotsMax = context.shots.shotsMax;

    const structuralFailure = structuralErrors > 0 || context.shots.failed;
    if (structuralFailure) {
        log.record(CHECK_IDS.STRUCTURE, 'fail',
            (log.errors.length) + ' structural problem(s) in the counts document');
    } else {
        log.record(CHECK_IDS.STRUCTURE, 'pass',
            game.questions.length + ' question(s), ' +
                show(context.shots.shotsPerCircuit) + ' shots each, counts schemaVersion ' +
                String(normalized.schemaVersion));
    }

    checkWinRate(context, verification);
    checkUncertainty(context, verification);
    checkNonSignaling(context, verification);
    checkSuperquantum(context, verification);

    return finish(log, verification, rates);
}

/**
 * Assemble the final result: statuses, ranking and the flat error lists.
 *
 * @param {CheckLog} log - Accumulated checks and issues.
 * @param {Object} verification - Block to finalize.
 * @param {Object|null} rates - Recomputed rates, or `null` when none were produced.
 * @returns {{valid: boolean, errors: Array, warnings: Array, verification: Object}} The result.
 */
function finish(log, verification, rates) {
    verification.checks = log.checks;

    const anyFailed = log.checks.some(function failed(check) {
        return check.status === 'fail';
    });

    if (anyFailed || log.errors.length > 0) {
        verification.status = 'failed';
    } else if (rates !== null && rates.winRateMean !== null) {
        verification.status = 'verified';
    } else {
        verification.status = 'unverified';
    }

    verification.ranked = verification.status === 'verified' && !anyFailed;

    return {
        valid: log.errors.length === 0,
        errors: log.errors,
        warnings: log.warnings,
        verification: verification
    };
}

module.exports = {
    VERIFIER_VERSION: VERIFIER_VERSION,
    CHECK_IDS: CHECK_IDS,
    VERIFY_ERROR_CODES: VERIFY_ERROR_CODES,
    verifyNonlocalGame: verifyNonlocalGame,
    sha256Hex: sha256Hex,
    decimalPlaces: decimalPlaces,
    displayTolerance: displayTolerance
};
