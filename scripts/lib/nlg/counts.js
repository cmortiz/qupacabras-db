/**
 * Per-question measurement counts: encoding, normalization and win-rate recomputation.
 *
 * The counts document is the raw evidence behind a reported win rate. It arrives from a submitted
 * pull request, so every key in it is untrusted text and every value is untrusted JSON. Two
 * consequences run through this file.
 *
 * 1. Nothing is read through the prototype chain. Question and answer maps are walked with
 *    `Object.keys` plus `Object.getOwnPropertyDescriptor`, so an inherited property is invisible
 *    and an accessor property is never invoked. A submitted key of `"__proto__"`, `"constructor"`
 *    or `"toString"` fails to parse and becomes an ordinary structural error.
 * 2. Every accepted count is a non-negative safe integer. Non-integers, negatives, `-0`,
 *    non-finite values and anything above `Number.MAX_SAFE_INTEGER` are rejected rather than
 *    coerced, because a silently coerced count changes a published number.
 *
 * Document shape, pinned:
 *
 *     {
 *       "schemaVersion": 1,
 *       "counts": {
 *         "<x>|<y>": { "<aliceBits>:<bobBits>": <integer>, ... },
 *         ...
 *       }
 *     }
 *
 * Question keys are decimal and unpadded. Answer keys are FIXED WIDTH, zero padded, MSB first,
 * with `a0` leftmost, at the widths the game declares. The fixed width is mandatory: without it
 * `"01"` and `"1"` name the same answer, a submitter can split one bin across two keys, and the
 * recomputed win rate stops matching the measured data. A key of the wrong width is therefore a
 * hard error and is never padded into shape.
 *
 * Missing answer keys are implicit zeros. A missing question key is a structural error, since a
 * question the submitter chose not to report is a question the win rate silently excludes.
 *
 * No file is read at module load time.
 */

const stats = require('./stats');

/** The only counts document version this verifier understands. */
const COUNTS_SCHEMA_VERSION = 1;

/**
 * Largest answer alphabet `buildMarginalTables` will materialize as dense columns. Every game in
 * the registry answers in 3 bits or fewer, so this is headroom rather than a real constraint; it
 * exists so a future game with a wide answer cannot make the verifier allocate without bound.
 */
const MAX_MARGINAL_COLUMNS = 1024;

/** Widest answer this module will encode or decode. Keeps every shift inside int32. */
const MAX_ANSWER_BITS = 30;

/** Default number of example keys quoted inside an aggregated error message. */
const DEFAULT_MAX_EXAMPLES = 5;

/** Stable codes attached to every error and warning this module produces. */
const COUNT_ERROR_CODES = Object.freeze({
    COUNTS_NOT_OBJECT: 'COUNTS_NOT_OBJECT',
    UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
    COUNTS_MISSING: 'COUNTS_MISSING',
    BAD_QUESTION_KEY: 'BAD_QUESTION_KEY',
    UNKNOWN_QUESTION: 'UNKNOWN_QUESTION',
    MISSING_QUESTION: 'MISSING_QUESTION',
    BAD_QUESTION_ENTRY: 'BAD_QUESTION_ENTRY',
    BAD_ANSWER_KEY: 'BAD_ANSWER_KEY',
    BAD_COUNT: 'BAD_COUNT',
    EMPTY_QUESTION: 'EMPTY_QUESTION',
    COUNT_OVERFLOW: 'COUNT_OVERFLOW',
    ANSWER_SPACE_TOO_LARGE: 'ANSWER_SPACE_TOO_LARGE'
});

const hasOwn = Object.prototype.hasOwnProperty;

/* ------------------------------------------------------------------ *
 * Untrusted object access
 * ------------------------------------------------------------------ */

/**
 * True for a value that can carry submitted keys: a non-null object that is not an array.
 *
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a plain-object-shaped container.
 */
function isPlainContainer(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read one own DATA property of an untrusted object.
 *
 * `Object.getOwnPropertyDescriptor` is used instead of indexing so that an inherited property is
 * never reached and an accessor property is never invoked. A submitted document cannot therefore
 * run code or read through `Object.prototype` during verification.
 *
 * @param {Object} object - Container to read from.
 * @param {string} key - Own property name.
 * @returns {*} The value, or `undefined` when the property is absent or is an accessor.
 */
function readOwn(object, key) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor === undefined || !hasOwn.call(descriptor, 'value')) {
        return undefined;
    }
    return descriptor.value;
}

/* ------------------------------------------------------------------ *
 * Key encoding
 * ------------------------------------------------------------------ */

/** Decimal, unpadded, non-negative on both sides. `"01|2"` and `"-1|2"` are rejected. */
const QUESTION_KEY_PATTERN = /^(0|[1-9][0-9]*)\|(0|[1-9][0-9]*)$/;

/**
 * Encode a question pair as its pinned key, `"<x>|<y>"`, decimal and unpadded.
 *
 * @param {number} x - Alice's question index, a non-negative safe integer.
 * @param {number} y - Bob's question index, a non-negative safe integer.
 * @returns {string} The question key.
 * @throws {TypeError} If either index is not a non-negative safe integer.
 */
function encodeQuestionKey(x, y) {
    if (!Number.isSafeInteger(x) || x < 0) {
        throw new TypeError('x must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(y) || y < 0) {
        throw new TypeError('y must be a non-negative safe integer');
    }
    return String(x) + '|' + String(y);
}

/**
 * Parse a question key.
 *
 * Strict by design: leading zeros, signs, whitespace and any other spelling are rejected rather
 * than normalized, so exactly one string names each question and a submitter cannot split one
 * question's shots across two spellings of its key.
 *
 * @param {*} key - Candidate key, from untrusted input.
 * @returns {{x: number, y: number}|null} The parsed pair, or `null` when the key is malformed.
 */
function parseQuestionKey(key) {
    if (typeof key !== 'string') {
        return null;
    }
    const match = QUESTION_KEY_PATTERN.exec(key);
    if (match === null) {
        return null;
    }
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        return null;
    }
    return { x: x, y: y };
}

/**
 * Reject an answer width this module cannot encode.
 *
 * @param {*} bits - Candidate width.
 * @param {string} label - Name used in the thrown message.
 * @returns {void}
 * @throws {RangeError} If the width is not an integer in `1..MAX_ANSWER_BITS`.
 */
function assertAnswerBits(bits, label) {
    if (!Number.isSafeInteger(bits) || bits < 1 || bits > MAX_ANSWER_BITS) {
        throw new RangeError(label + ' must be an integer in 1..' + MAX_ANSWER_BITS);
    }
}

/**
 * Render one answer as a fixed-width binary string, MSB first.
 *
 * @param {number} value - Answer value.
 * @param {number} bits - Fixed width.
 * @returns {string} Zero-padded binary string of length `bits`.
 * @throws {RangeError} If the value does not fit the width.
 */
function toFixedBits(value, bits) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= Math.pow(2, bits)) {
        throw new RangeError('answer ' + String(value) + ' does not fit in ' + bits + ' bits');
    }
    return value.toString(2).padStart(bits, '0');
}

/**
 * Encode an answer pair as its pinned key, `"<alice bits>:<bob bits>"`.
 *
 * @param {number} a - Alice's answer.
 * @param {number} b - Bob's answer.
 * @param {number} aliceAnswerBits - Alice's fixed answer width.
 * @param {number} bobAnswerBits - Bob's fixed answer width.
 * @returns {string} The answer key.
 * @throws {RangeError} If a width is out of range or an answer does not fit its width.
 */
function encodeAnswerKey(a, b, aliceAnswerBits, bobAnswerBits) {
    assertAnswerBits(aliceAnswerBits, 'aliceAnswerBits');
    assertAnswerBits(bobAnswerBits, 'bobAnswerBits');
    return toFixedBits(a, aliceAnswerBits) + ':' + toFixedBits(b, bobAnswerBits);
}

/**
 * True when every character of `text` is `0` or `1`.
 *
 * @param {string} text - Candidate bit string.
 * @returns {boolean} Whether the string is binary.
 */
function isBinary(text) {
    for (let i = 0; i < text.length; i += 1) {
        const ch = text.charCodeAt(i);
        if (ch !== 48 && ch !== 49) {
            return false;
        }
    }
    return true;
}

/**
 * Parse an answer key at the game's declared widths.
 *
 * The width check is exact. A key of the wrong length is rejected rather than padded, because
 * padding would let `"01"` and `"1"` name the same answer and let a submitter split one bin.
 *
 * @param {*} key - Candidate key, from untrusted input.
 * @param {number} aliceAnswerBits - Alice's fixed answer width.
 * @param {number} bobAnswerBits - Bob's fixed answer width.
 * @returns {{a: number, b: number}|null} The parsed pair, or `null` when the key is malformed.
 * @throws {RangeError} If a declared width is out of range.
 */
function parseAnswerKey(key, aliceAnswerBits, bobAnswerBits) {
    assertAnswerBits(aliceAnswerBits, 'aliceAnswerBits');
    assertAnswerBits(bobAnswerBits, 'bobAnswerBits');
    if (typeof key !== 'string' || key.length !== aliceAnswerBits + bobAnswerBits + 1) {
        return null;
    }
    if (key.charCodeAt(aliceAnswerBits) !== 58) {
        return null;
    }
    const left = key.slice(0, aliceAnswerBits);
    const right = key.slice(aliceAnswerBits + 1);
    if (!isBinary(left) || !isBinary(right)) {
        return null;
    }
    return { a: parseInt(left, 2), b: parseInt(right, 2) };
}

/**
 * Bit `index` of a fixed-width answer, MSB first, so index 0 is the leftmost character of the
 * encoded key. This is the convention `games/magic-square.js` reads its row and column entries
 * with, and the one the answer key spells out.
 *
 * @param {number} value - Answer value.
 * @param {number} index - Bit position, 0 for the leftmost bit.
 * @param {number} width - Fixed answer width in bits.
 * @returns {number} 0 or 1.
 * @throws {RangeError} If the width, index or value is out of range.
 */
function bitAt(value, index, width) {
    assertAnswerBits(width, 'width');
    if (!Number.isSafeInteger(index) || index < 0 || index >= width) {
        throw new RangeError('index must be an integer in 0..' + (width - 1));
    }
    if (!Number.isSafeInteger(value) || value < 0 || value >= Math.pow(2, width)) {
        throw new RangeError('value ' + String(value) + ' does not fit in ' + width + ' bits');
    }
    return (value >>> (width - 1 - index)) & 1;
}

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} QuestionTable
 * @property {string} key - The question key.
 * @property {Object} question - The game's question record, `{key, x, y, weight}`.
 * @property {boolean} present - Whether the counts document carried this question at all.
 * @property {Map<number, number>} cells - `a * bobRadix + b` to count, sparse, zeros omitted.
 * @property {number} total - Sum of the question's counts.
 * @property {number} wins - Sum of the counts on winning answer pairs.
 */

/**
 * @typedef {Object} NormalizedCounts
 * @property {Object} game - The resolved game definition.
 * @property {number|null} schemaVersion - The document's declared version, when readable.
 * @property {QuestionTable[]} tables - One entry per game question, in the game's question order.
 * @property {number[]} totals - Per-question shot totals, parallel to `tables`.
 * @property {Array<{field: string, message: string, code: string}>} errors
 * @property {Array<{field: string, message: string, code: string}>} warnings
 */

/**
 * Build an issue record in the shape the rest of the pipeline uses.
 *
 * @param {string} field - Dotted or bracketed path into the counts document.
 * @param {string} message - Human-readable description.
 * @param {string} code - Stable machine-readable code.
 * @returns {{field: string, message: string, code: string}} The issue.
 */
function issue(field, message, code) {
    return { field: field, message: message, code: code };
}

/**
 * Render a capped list of keys for an aggregated message.
 *
 * @param {string[]} keys - Keys to quote.
 * @param {number} maxExamples - How many to show before summarizing the remainder.
 * @returns {string} A comma-separated list, with a trailing count when truncated.
 */
function examples(keys, maxExamples) {
    if (keys.length <= maxExamples) {
        return keys.join(', ');
    }
    return keys.slice(0, maxExamples).join(', ') + ', and ' + (keys.length - maxExamples) + ' more';
}

/**
 * Validate a counts document against a game and reduce it to per-question tables.
 *
 * Every game question gets a table, present in the document or not, so downstream code can index
 * the game's question list without a membership test. A question the document omits is recorded
 * with `present: false` and a total of zero, and produces a `MISSING_QUESTION` error.
 *
 * Structural problems accumulate into `errors` rather than throwing. The caller decides what a
 * failure means; this function's job is to report every problem it can see in one pass, so a
 * submitter fixing a file learns about all of it at once.
 *
 * @param {*} doc - Parsed counts document, untrusted.
 * @param {Object} game - Resolved `NonlocalGameDef` from the registry.
 * @param {Object} [options] - Optional settings.
 * @param {number} [options.maxExamples=5] - Keys quoted per aggregated message.
 * @returns {NormalizedCounts} Tables, totals and every problem found.
 * @throws {TypeError} If `game` is not a game definition. A malformed game is a bug in this
 *   repository, unlike a malformed document, which is a submitter problem and never throws.
 */
function normalizeCounts(doc, game, options) {
    if (!isPlainContainer(game) || !Array.isArray(game.questions)) {
        throw new TypeError('game must be a resolved nonlocal game definition');
    }

    const settings = isPlainContainer(options) ? options : {};
    const maxExamples = Number.isSafeInteger(settings.maxExamples) && settings.maxExamples > 0
        ? settings.maxExamples
        : DEFAULT_MAX_EXAMPLES;

    const errors = [];
    const warnings = [];

    const aliceBits = game.aliceAnswerBits;
    const bobBits = game.bobAnswerBits;
    const result = {
        game: game,
        schemaVersion: null,
        tables: [],
        totals: [],
        errors: errors,
        warnings: warnings
    };

    if (!Number.isSafeInteger(aliceBits) || aliceBits < 1 || aliceBits > MAX_ANSWER_BITS ||
        !Number.isSafeInteger(bobBits) || bobBits < 1 || bobBits > MAX_ANSWER_BITS) {
        errors.push(issue(
            'game',
            'game "' + String(game.id) + '" declares answer widths this verifier cannot encode',
            COUNT_ERROR_CODES.ANSWER_SPACE_TOO_LARGE
        ));
        return result;
    }

    const bobRadix = Math.pow(2, bobBits);

    // One table per game question, in the game's own order, indexed by key for the lookup below.
    const byKey = new Map();
    for (let i = 0; i < game.questions.length; i += 1) {
        const question = game.questions[i];
        const table = {
            key: question.key,
            question: question,
            present: false,
            cells: new Map(),
            total: 0,
            wins: 0
        };
        result.tables.push(table);
        byKey.set(question.key, table);
    }

    if (!isPlainContainer(doc)) {
        errors.push(issue(
            'counts',
            'counts document must be a JSON object',
            COUNT_ERROR_CODES.COUNTS_NOT_OBJECT
        ));
        result.totals = result.tables.map(readTotal);
        return result;
    }

    const schemaVersion = readOwn(doc, 'schemaVersion');
    result.schemaVersion = typeof schemaVersion === 'number' ? schemaVersion : null;
    if (schemaVersion !== COUNTS_SCHEMA_VERSION) {
        errors.push(issue(
            'schemaVersion',
            'counts schemaVersion must be ' + COUNTS_SCHEMA_VERSION +
                ', the only version this verifier supports',
            COUNT_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION
        ));
    }

    const counts = readOwn(doc, 'counts');
    if (!isPlainContainer(counts)) {
        errors.push(issue(
            'counts',
            'counts document must carry a "counts" object of question keys',
            COUNT_ERROR_CODES.COUNTS_MISSING
        ));
        result.totals = result.tables.map(readTotal);
        return result;
    }

    const badQuestionKeys = [];
    const unknownQuestionKeys = [];
    const emptyQuestionKeys = [];

    const questionKeys = Object.keys(counts);
    for (let i = 0; i < questionKeys.length; i += 1) {
        const questionKey = questionKeys[i];
        const parsed = parseQuestionKey(questionKey);
        if (parsed === null) {
            badQuestionKeys.push(JSON.stringify(questionKey));
            continue;
        }
        const table = byKey.get(questionKey);
        if (table === undefined) {
            unknownQuestionKeys.push(questionKey);
            continue;
        }

        table.present = true;
        readQuestionEntry(readOwn(counts, questionKey), table, {
            aliceBits: aliceBits,
            bobBits: bobBits,
            bobRadix: bobRadix,
            game: game,
            maxExamples: maxExamples,
            errors: errors
        });

        if (table.total <= 0) {
            emptyQuestionKeys.push(questionKey);
        }
    }

    const missingQuestionKeys = [];
    for (let i = 0; i < result.tables.length; i += 1) {
        if (!result.tables[i].present) {
            missingQuestionKeys.push(result.tables[i].key);
        }
    }

    if (badQuestionKeys.length > 0) {
        errors.push(issue(
            'counts',
            badQuestionKeys.length + ' question key(s) are not of the form "<x>|<y>" with ' +
                'unpadded decimal indices: ' + examples(badQuestionKeys, maxExamples),
            COUNT_ERROR_CODES.BAD_QUESTION_KEY
        ));
    }
    if (unknownQuestionKeys.length > 0) {
        errors.push(issue(
            'counts',
            unknownQuestionKeys.length + ' question key(s) are not questions of game "' +
                game.id + '": ' + examples(unknownQuestionKeys, maxExamples),
            COUNT_ERROR_CODES.UNKNOWN_QUESTION
        ));
    }
    if (missingQuestionKeys.length > 0) {
        errors.push(issue(
            'counts',
            missingQuestionKeys.length + ' of the ' + game.questions.length + ' questions of game "' +
                game.id + '" have no counts: ' + examples(missingQuestionKeys, maxExamples),
            COUNT_ERROR_CODES.MISSING_QUESTION
        ));
    }
    if (emptyQuestionKeys.length > 0) {
        errors.push(issue(
            'counts',
            emptyQuestionKeys.length + ' question(s) have a total of zero shots: ' +
                examples(emptyQuestionKeys, maxExamples),
            COUNT_ERROR_CODES.EMPTY_QUESTION
        ));
    }

    result.totals = result.tables.map(readTotal);
    return result;
}

/**
 * @param {QuestionTable} table - A question table.
 * @returns {number} The table's shot total.
 */
function readTotal(table) {
    return table.total;
}

/**
 * Read one question's answer map into its table, accumulating shots and wins.
 *
 * @param {*} entry - The submitted value for this question, untrusted.
 * @param {QuestionTable} table - Table to fill.
 * @param {Object} context - Widths, game, error sink and message settings.
 * @returns {void}
 */
function readQuestionEntry(entry, table, context) {
    const field = 'counts["' + table.key + '"]';

    if (!isPlainContainer(entry)) {
        context.errors.push(issue(
            field,
            'question "' + table.key + '" must map to an object of answer keys',
            COUNT_ERROR_CODES.BAD_QUESTION_ENTRY
        ));
        return;
    }

    const badAnswerKeys = [];
    const badCounts = [];
    let overflowed = false;

    const answerKeys = Object.keys(entry);
    for (let i = 0; i < answerKeys.length; i += 1) {
        const answerKey = answerKeys[i];
        const answer = parseAnswerKey(answerKey, context.aliceBits, context.bobBits);
        if (answer === null) {
            badAnswerKeys.push(JSON.stringify(answerKey));
            continue;
        }

        const count = readOwn(entry, answerKey);
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 ||
            Object.is(count, -0)) {
            badCounts.push(JSON.stringify(answerKey));
            continue;
        }
        if (count === 0) {
            continue;
        }

        if (table.total > Number.MAX_SAFE_INTEGER - count) {
            overflowed = true;
            break;
        }

        const cellKey = answer.a * context.bobRadix + answer.b;
        table.cells.set(cellKey, (table.cells.get(cellKey) || 0) + count);
        table.total += count;
        if (context.game.isWin(table.question, answer.a, answer.b) === true) {
            table.wins += count;
        }
    }

    if (badAnswerKeys.length > 0) {
        context.errors.push(issue(
            field,
            badAnswerKeys.length + ' answer key(s) are not ' + context.aliceBits + ':' +
                context.bobBits + ' fixed-width binary of the form "<alice bits>:<bob bits>": ' +
                examples(badAnswerKeys, context.maxExamples),
            COUNT_ERROR_CODES.BAD_ANSWER_KEY
        ));
    }
    if (badCounts.length > 0) {
        context.errors.push(issue(
            field,
            badCounts.length + ' count(s) are not non-negative safe integers: ' +
                examples(badCounts, context.maxExamples),
            COUNT_ERROR_CODES.BAD_COUNT
        ));
    }
    if (overflowed) {
        context.errors.push(issue(
            field,
            'question "' + table.key + '" totals more than Number.MAX_SAFE_INTEGER shots',
            COUNT_ERROR_CODES.COUNT_OVERFLOW
        ));
    }
}

/* ------------------------------------------------------------------ *
 * Win rates
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} WinRates
 * @property {Array<{key: string, x: number, y: number, wins: number, shots: number,
 *   winRate: number}>} perQuestion - One entry per question that carries shots, in game order.
 * @property {number|null} winRateMean - Unweighted mean of the per-question rates, the published
 *   convention. `null` when no question carries shots.
 * @property {number|null} winRatePooled - Total wins divided by total shots. Equal to the mean
 *   only when every question has the same shot count.
 * @property {number} totalShots
 * @property {number} totalWins
 * @property {number} questions - Number of questions contributing, which is the length of
 *   `perQuestion`.
 */

/**
 * Recompute win rates from normalized counts.
 *
 * The mean is taken with `stats.mean`, which reproduces NumPy's pairwise summation order. That is
 * what makes the recomputed value equal the published one bit for bit rather than to within 1e-14,
 * so it must not be replaced with a hand-rolled sum.
 *
 * Questions with no shots are excluded rather than counted as zero. A question with no shots is a
 * structural error already reported by `normalizeCounts`, and folding a zero into the mean would
 * quietly change the number being compared against the claim.
 *
 * @param {NormalizedCounts} nc - Output of `normalizeCounts`.
 * @returns {WinRates} The recomputed rates.
 */
function computeWinRates(nc) {
    const perQuestion = [];
    let totalShots = 0;
    let totalWins = 0;

    for (let i = 0; i < nc.tables.length; i += 1) {
        const table = nc.tables[i];
        if (table.total <= 0) {
            continue;
        }
        perQuestion.push({
            key: table.key,
            x: table.question.x,
            y: table.question.y,
            wins: table.wins,
            shots: table.total,
            winRate: table.wins / table.total
        });
        totalShots += table.total;
        totalWins += table.wins;
    }

    if (perQuestion.length === 0) {
        return {
            perQuestion: perQuestion,
            winRateMean: null,
            winRatePooled: null,
            totalShots: 0,
            totalWins: 0,
            questions: 0
        };
    }

    const rates = perQuestion.map(readWinRate);
    return {
        perQuestion: perQuestion,
        winRateMean: stats.mean(rates),
        winRatePooled: totalWins / totalShots,
        totalShots: totalShots,
        totalWins: totalWins,
        questions: perQuestion.length
    };
}

/**
 * @param {{winRate: number}} entry - A per-question record.
 * @returns {number} Its win rate.
 */
function readWinRate(entry) {
    return entry.winRate;
}

/* ------------------------------------------------------------------ *
 * Marginal tables for the non-signaling check
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} MarginalGroup
 * @property {'alice'|'bob'} side - Whose answer the columns range over.
 * @property {number} question - The fixed question index for that side.
 * @property {number[]} partners - The other side's question indices, one per row.
 * @property {number[]} answers - The answer values, one per column.
 * @property {number[][]} table - Rows by partners, columns by answers.
 */

/**
 * Build the contingency tables the non-signaling check runs on.
 *
 * Non-signaling says Alice's outcome distribution must not depend on which question Bob was
 * asked. So for each of Alice's questions `x` that appears with two or more of Bob's questions,
 * one table is built whose rows are those `y` values and whose columns are Alice's answers,
 * marginalized over Bob's answer. A dependence of the row distribution on `y` is what the
 * chi-square test detects. The symmetric family is built for Bob.
 *
 * Groups with fewer than two rows carry no information and are omitted.
 *
 * @param {NormalizedCounts} nc - Output of `normalizeCounts`.
 * @returns {MarginalGroup[]} Groups, Alice's first, each in ascending partner order.
 */
function buildMarginalTables(nc) {
    const game = nc.game;
    const aliceRadix = Math.pow(2, game.aliceAnswerBits);
    const bobRadix = Math.pow(2, game.bobAnswerBits);
    if (aliceRadix > MAX_MARGINAL_COLUMNS || bobRadix > MAX_MARGINAL_COLUMNS) {
        return [];
    }

    // side key -> Map(partner -> marginal row over that side's answers)
    const aliceGroups = new Map();
    const bobGroups = new Map();

    for (let i = 0; i < nc.tables.length; i += 1) {
        const table = nc.tables[i];
        if (table.total <= 0) {
            continue;
        }
        const x = table.question.x;
        const y = table.question.y;

        const aliceRow = new Array(aliceRadix).fill(0);
        const bobRow = new Array(bobRadix).fill(0);
        table.cells.forEach(function accumulate(count, cellKey) {
            const a = Math.floor(cellKey / bobRadix);
            const b = cellKey - a * bobRadix;
            aliceRow[a] += count;
            bobRow[b] += count;
        });

        addRow(aliceGroups, x, y, aliceRow);
        addRow(bobGroups, y, x, bobRow);
    }

    const groups = [];
    collectGroups(groups, aliceGroups, 'alice', aliceRadix);
    collectGroups(groups, bobGroups, 'bob', bobRadix);
    return groups;
}

/**
 * @param {Map<number, Map<number, number[]>>} groups - Accumulator.
 * @param {number} fixed - The fixed question index.
 * @param {number} partner - The other side's question index.
 * @param {number[]} row - Marginal counts for this pair.
 * @returns {void}
 */
function addRow(groups, fixed, partner, row) {
    let byPartner = groups.get(fixed);
    if (byPartner === undefined) {
        byPartner = new Map();
        groups.set(fixed, byPartner);
    }
    const existing = byPartner.get(partner);
    if (existing === undefined) {
        byPartner.set(partner, row);
        return;
    }
    for (let i = 0; i < row.length; i += 1) {
        existing[i] += row[i];
    }
}

/**
 * @param {MarginalGroup[]} out - Destination array.
 * @param {Map<number, Map<number, number[]>>} groups - Accumulator to drain.
 * @param {'alice'|'bob'} side - Which side's answers the columns range over.
 * @param {number} radix - Number of answer values on that side.
 * @returns {void}
 */
function collectGroups(out, groups, side, radix) {
    const answers = [];
    for (let value = 0; value < radix; value += 1) {
        answers.push(value);
    }
    const fixedValues = Array.from(groups.keys()).sort(ascending);
    for (let i = 0; i < fixedValues.length; i += 1) {
        const byPartner = groups.get(fixedValues[i]);
        if (byPartner.size < 2) {
            continue;
        }
        const partners = Array.from(byPartner.keys()).sort(ascending);
        const table = partners.map(function toRow(partner) {
            return byPartner.get(partner);
        });
        out.push({
            side: side,
            question: fixedValues[i],
            partners: partners,
            answers: answers,
            table: table
        });
    }
}

/**
 * @param {number} a - First value.
 * @param {number} b - Second value.
 * @returns {number} Ascending comparison result.
 */
function ascending(a, b) {
    return a - b;
}

module.exports = {
    COUNTS_SCHEMA_VERSION: COUNTS_SCHEMA_VERSION,
    COUNT_ERROR_CODES: COUNT_ERROR_CODES,
    encodeQuestionKey: encodeQuestionKey,
    parseQuestionKey: parseQuestionKey,
    encodeAnswerKey: encodeAnswerKey,
    parseAnswerKey: parseAnswerKey,
    bitAt: bitAt,
    normalizeCounts: normalizeCounts,
    computeWinRates: computeWinRates,
    buildMarginalTables: buildMarginalTables
};
