/**
 * Tests for `scripts/lib/nlg/counts.js`.
 *
 * Run with `node --test scripts/lib/nlg/__tests__/*.test.js` (unquoted, so the shell expands the
 * glob). These use `node:test`, not Jest, and live under `scripts/` where the CRA Jest runner
 * does not look.
 *
 * Two themes run through the file. The first is that the encoding is exact: a key of the wrong
 * width, a padded question index or a stray character is rejected rather than repaired, because
 * every repair is a way for one question's shots to end up in two bins. The second is that a
 * submitted document is untrusted data and never a source of behaviour: prototype keys, inherited
 * properties and accessor properties must all be inert, and `Object.prototype` must be untouched
 * afterwards.
 *
 * Every file is read inside a test body, never at module load time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const counts = require('../counts');
const registry = require('../registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'submissions', 'template');

/**
 * @param {string} filePath - Absolute path to a JSON file.
 * @returns {*} Parsed contents.
 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * A minimal well-formed counts document for the odd cycle C_3, with every question's ten shots on
 * a single answer pair, so each question wins outright or loses outright and every assertion
 * about structure stays independent of the arithmetic.
 *
 * Five of the six questions win. `2|2` answers `0:1` on a same-vertex question, which loses.
 *
 * @returns {Object} A fresh document.
 */
function minimalOddCycleDoc() {
    return {
        schemaVersion: 1,
        counts: {
            '0|0': { '0:0': 10 },
            '1|1': { '1:1': 10 },
            '2|2': { '0:1': 10 },
            '0|1': { '0:1': 10 },
            '1|2': { '1:0': 10 },
            '2|0': { '0:1': 10 }
        }
    };
}

/**
 * @param {Array<{code: string}>} issues - Errors or warnings.
 * @returns {string[]} Their codes.
 */
function codesOf(issues) {
    return issues.map((entry) => entry.code);
}

test('encodeQuestionKey and parseQuestionKey round-trip', () => {
    assert.equal(counts.encodeQuestionKey(0, 0), '0|0');
    assert.equal(counts.encodeQuestionKey(13, 7), '13|7');
    assert.deepEqual(counts.parseQuestionKey('13|7'), { x: 13, y: 7 });
    assert.deepEqual(counts.parseQuestionKey('0|0'), { x: 0, y: 0 });
});

test('parseQuestionKey rejects every spelling but the canonical one', () => {
    // Leading zeros would let "01|2" and "1|2" name the same question, so one question's shots
    // could be split across two keys and the recomputed rate would drop half of them.
    assert.equal(counts.parseQuestionKey('01|2'), null);
    assert.equal(counts.parseQuestionKey('1|02'), null);
    assert.equal(counts.parseQuestionKey('-1|2'), null);
    assert.equal(counts.parseQuestionKey(' 1|2'), null);
    assert.equal(counts.parseQuestionKey('1|2 '), null);
    assert.equal(counts.parseQuestionKey('1|2|3'), null);
    assert.equal(counts.parseQuestionKey('1,2'), null);
    assert.equal(counts.parseQuestionKey('1|'), null);
    assert.equal(counts.parseQuestionKey(''), null);
    assert.equal(counts.parseQuestionKey('__proto__'), null);
    assert.equal(counts.parseQuestionKey(null), null);
    assert.equal(counts.parseQuestionKey(12), null);
});

test('encodeQuestionKey rejects indices it cannot spell', () => {
    assert.throws(() => counts.encodeQuestionKey(-1, 0), TypeError);
    assert.throws(() => counts.encodeQuestionKey(1.5, 0), TypeError);
    assert.throws(() => counts.encodeQuestionKey(0, NaN), TypeError);
});

test('encodeAnswerKey pads to the declared widths, MSB first', () => {
    assert.equal(counts.encodeAnswerKey(0, 0, 2, 2), '00:00');
    assert.equal(counts.encodeAnswerKey(1, 2, 2, 2), '01:10');
    assert.equal(counts.encodeAnswerKey(3, 3, 2, 2), '11:11');
    assert.equal(counts.encodeAnswerKey(5, 1, 3, 3), '101:001');
    assert.equal(counts.encodeAnswerKey(1, 0, 1, 1), '1:0');
});

test('parseAnswerKey enforces the exact width', () => {
    assert.deepEqual(counts.parseAnswerKey('01:10', 2, 2), { a: 1, b: 2 });
    assert.deepEqual(counts.parseAnswerKey('101:001', 3, 3), { a: 5, b: 1 });

    // The width is what stops "01" and "1" naming the same answer.
    assert.equal(counts.parseAnswerKey('1:1', 2, 2), null);
    assert.equal(counts.parseAnswerKey('001:10', 2, 2), null);
    assert.equal(counts.parseAnswerKey('01:110', 2, 2), null);
    assert.equal(counts.parseAnswerKey('0110', 2, 2), null);
    assert.equal(counts.parseAnswerKey('01;10', 2, 2), null);
    assert.equal(counts.parseAnswerKey('0a:10', 2, 2), null);
    assert.equal(counts.parseAnswerKey('__proto__', 2, 2), null);
    assert.equal(counts.parseAnswerKey(null, 2, 2), null);
});

test('bitAt reads MSB first, matching the answer key spelling', () => {
    // 0b101 spells "101", so index 0 is the leftmost character.
    assert.equal(counts.bitAt(5, 0, 3), 1);
    assert.equal(counts.bitAt(5, 1, 3), 0);
    assert.equal(counts.bitAt(5, 2, 3), 1);

    const key = counts.encodeAnswerKey(6, 0, 3, 3);
    assert.equal(key, '110:000');
    for (let i = 0; i < 3; i += 1) {
        assert.equal(String(counts.bitAt(6, i, 3)), key[i]);
    }

    assert.throws(() => counts.bitAt(5, 3, 3), RangeError);
    assert.throws(() => counts.bitAt(8, 0, 3), RangeError);
    assert.throws(() => counts.bitAt(5, 0, 0), RangeError);
});

test('normalizeCounts accepts the shipped template counts', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const normalized = counts.normalizeCounts(doc, game);

    assert.deepEqual(normalized.errors, []);
    assert.deepEqual(normalized.warnings, []);
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.tables.length, 6);
    assert.ok(normalized.tables.every((table) => table.present));
    assert.deepEqual(normalized.totals, [1024, 1024, 1024, 1024, 1024, 1024]);
});

test('computeWinRates reproduces the template claim exactly', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const benchmark = readJson(path.join(TEMPLATE_DIR, 'benchmark.json'));

    const rates = counts.computeWinRates(counts.normalizeCounts(doc, game));

    assert.equal(rates.questions, 6);
    assert.equal(rates.totalShots, 6144);
    assert.equal(rates.winRateMean, benchmark.nonlocalGame.winRate);
    // Constant shots, so the unweighted mean and the pooled rate coincide.
    assert.equal(rates.winRatePooled, rates.winRateMean);
    assert.equal(rates.totalWins / rates.totalShots, rates.winRatePooled);
});

test('computeWinRates skips questions with no shots rather than counting them as zero', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = minimalOddCycleDoc();
    doc.counts['2|0'] = {};

    const normalized = counts.normalizeCounts(doc, game);
    assert.ok(codesOf(normalized.errors).includes('EMPTY_QUESTION'));

    const rates = counts.computeWinRates(normalized);
    assert.equal(rates.questions, 5);
    assert.equal(rates.totalShots, 50);
    // Four of the five contributing questions win outright, `2|2` loses outright. Counting the
    // emptied question as a zero would give 4/6 instead.
    assert.equal(rates.winRateMean, 4 / 5);
});

test('normalizeCounts rejects an unsupported schemaVersion by name', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = minimalOddCycleDoc();
    doc.schemaVersion = 2;

    const normalized = counts.normalizeCounts(doc, game);
    const versionError = normalized.errors.find((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION');
    assert.ok(versionError);
    assert.match(versionError.message, /must be 1/);
});

test('normalizeCounts reports a missing counts container', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    assert.deepEqual(codesOf(counts.normalizeCounts({ schemaVersion: 1 }, game).errors),
        ['COUNTS_MISSING']);
    assert.deepEqual(codesOf(counts.normalizeCounts(null, game).errors), ['COUNTS_NOT_OBJECT']);
    assert.deepEqual(codesOf(counts.normalizeCounts([], game).errors), ['COUNTS_NOT_OBJECT']);
    assert.deepEqual(codesOf(counts.normalizeCounts('{}', game).errors), ['COUNTS_NOT_OBJECT']);
});

test('normalizeCounts reports missing and unknown questions', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = minimalOddCycleDoc();
    delete doc.counts['1|2'];
    doc.counts['0|2'] = { '0:1': 10 };

    const normalized = counts.normalizeCounts(doc, game);
    const codes = codesOf(normalized.errors);
    assert.ok(codes.includes('MISSING_QUESTION'));
    assert.ok(codes.includes('UNKNOWN_QUESTION'));
    assert.match(normalized.errors.find((e) => e.code === 'MISSING_QUESTION').message, /1\|2/);
    assert.match(normalized.errors.find((e) => e.code === 'UNKNOWN_QUESTION').message, /0\|2/);
});

test('normalizeCounts rejects answer keys of the wrong width instead of padding them', () => {
    const game = registry.getGame('g14');
    const doc = { schemaVersion: 1, counts: {} };
    game.questions.forEach((question) => {
        doc.counts[question.key] = { '00:00': 8 };
    });
    // "1:0" would be a legal 1-bit key, and padding it to "01:00" would silently merge it with a
    // genuine "01:00" bin.
    doc.counts['0|0'] = { '00:00': 4, '1:0': 4 };

    const normalized = counts.normalizeCounts(doc, game);
    const badKey = normalized.errors.find((e) => e.code === 'BAD_ANSWER_KEY');
    assert.ok(badKey);
    assert.equal(badKey.field, 'counts["0|0"]');
    assert.match(badKey.message, /2:2 fixed-width binary/);
});

test('normalizeCounts rejects every non-count a submitter could write', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const cases = [
        ['negative', -1],
        ['fractional', 1.5],
        ['string', '10'],
        ['null', null],
        ['boolean', true],
        ['above MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
        ['negative zero', JSON.parse('-0')]
    ];

    cases.forEach(([label, value]) => {
        const doc = minimalOddCycleDoc();
        doc.counts['0|0'] = { '0:0': value };
        const normalized = counts.normalizeCounts(doc, game);
        assert.ok(codesOf(normalized.errors).includes('BAD_COUNT'), label + ' should be rejected');
    });

    // Infinity and NaN cannot appear in JSON but can arrive from a programmatic caller.
    const infinite = minimalOddCycleDoc();
    infinite.counts['0|0'] = { '0:0': Infinity };
    assert.ok(codesOf(counts.normalizeCounts(infinite, game).errors).includes('BAD_COUNT'));
});

test('normalizeCounts rejects a non-object question entry', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    [42, 'counts', null, [['0:0', 10]]].forEach((entry) => {
        const doc = minimalOddCycleDoc();
        doc.counts['0|0'] = entry;
        const normalized = counts.normalizeCounts(doc, game);
        assert.ok(codesOf(normalized.errors).includes('BAD_QUESTION_ENTRY'));
    });
});

test('a zero count is an implicit zero, not an error', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = minimalOddCycleDoc();
    doc.counts['0|0'] = { '0:0': 10, '0:1': 0, '1:0': 0 };

    const normalized = counts.normalizeCounts(doc, game);
    assert.deepEqual(normalized.errors, []);
    assert.equal(normalized.totals[0], 10);
});

test('prototype keys in a submitted document are inert', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const before = Object.getOwnPropertyNames(Object.prototype).slice().sort();

    // Built through JSON.parse, which is how such a key really arrives: it becomes an OWN data
    // property of the parsed object rather than reaching the prototype.
    const doc = JSON.parse(JSON.stringify(minimalOddCycleDoc()).replace(
        '"0|0":', '"__proto__": {"polluted": 1}, "constructor": {"0:0": 5}, "toString": 7, "0|0":'
    ));

    const normalized = counts.normalizeCounts(doc, game);
    const codes = codesOf(normalized.errors);
    assert.ok(codes.includes('BAD_QUESTION_KEY'));
    const badKeys = normalized.errors.find((e) => e.code === 'BAD_QUESTION_KEY');
    assert.match(badKeys.message, /__proto__/);
    assert.match(badKeys.message, /constructor/);
    assert.match(badKeys.message, /toString/);

    // The six real questions still parse, so the bad keys were skipped rather than fatal.
    assert.equal(counts.computeWinRates(normalized).questions, 6);

    assert.equal(({}).polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).slice().sort(), before);
});

test('prototype keys used as ANSWER keys are inert', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const before = Object.getOwnPropertyNames(Object.prototype).slice().sort();

    const doc = JSON.parse(
        '{"schemaVersion":1,"counts":{' +
        '"0|0":{"__proto__":{"polluted":1},"constructor":3,"toString":4,"0:0":10},' +
        '"1|1":{"1:1":10},"2|2":{"0:0":10},' +
        '"0|1":{"0:1":10},"1|2":{"1:0":10},"2|0":{"0:1":10}}}'
    );

    const normalized = counts.normalizeCounts(doc, game);
    const badKey = normalized.errors.find((e) => e.code === 'BAD_ANSWER_KEY');
    assert.ok(badKey);
    assert.equal(badKey.field, 'counts["0|0"]');
    assert.equal(normalized.totals[0], 10);

    assert.equal(({}).polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).slice().sort(), before);
});

test('inherited properties are invisible to normalizeCounts', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const inherited = { '0|0': { '0:0': 10 } };
    const doc = { schemaVersion: 1, counts: Object.create(inherited) };
    doc.counts['1|1'] = { '1:1': 10 };

    const normalized = counts.normalizeCounts(doc, game);
    const missing = normalized.errors.find((e) => e.code === 'MISSING_QUESTION');
    assert.ok(missing);
    assert.match(missing.message, /0\|0/);
    assert.equal(normalized.totals[0], 0);
});

test('accessor properties are never invoked', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const container = {};
    let invoked = 0;
    Object.defineProperty(container, '0|0', {
        enumerable: true,
        get() {
            invoked += 1;
            throw new Error('a submitted document must never run code');
        }
    });

    const normalized = counts.normalizeCounts({ schemaVersion: 1, counts: container }, game);
    assert.equal(invoked, 0);
    assert.ok(codesOf(normalized.errors).includes('BAD_QUESTION_ENTRY'));
});

test('normalizeCounts throws only for a malformed game, which is a repository bug', () => {
    assert.throws(() => counts.normalizeCounts({}, null), TypeError);
    assert.throws(() => counts.normalizeCounts({}, { questions: 'not an array' }), TypeError);
});

test('buildMarginalTables pairs each question against its partners', () => {
    const game = registry.getGame('odd-cycle', { n: 3 });
    const doc = readJson(path.join(TEMPLATE_DIR, 'counts.json'));
    const groups = counts.buildMarginalTables(counts.normalizeCounts(doc, game));

    // C_3 gives each vertex exactly two partners on each side, so six groups of two rows.
    assert.equal(groups.length, 6);
    assert.equal(groups.filter((g) => g.side === 'alice').length, 3);
    assert.equal(groups.filter((g) => g.side === 'bob').length, 3);

    groups.forEach((group) => {
        assert.equal(group.partners.length, 2);
        assert.equal(group.table.length, 2);
        assert.deepEqual(group.answers, [0, 1]);
        group.table.forEach((row) => {
            assert.equal(row.length, 2);
            assert.equal(row[0] + row[1], 1024);
        });
    });

    const aliceZero = groups.find((g) => g.side === 'alice' && g.question === 0);
    assert.deepEqual(aliceZero.partners, [0, 1]);
    // Row (x = 0, y = 0): Alice answers 0 on 441 + 97 shots, 1 on 95 + 391.
    assert.deepEqual(aliceZero.table[0], [538, 486]);
});

test('marginal tables marginalize over the other player, so rows sum to the shot count', () => {
    const game = registry.getGame('g14');
    const doc = { schemaVersion: 1, counts: {} };
    game.questions.forEach((question, index) => {
        doc.counts[question.key] = {
            '00:00': 100,
            '01:10': 50,
            '10:11': 30,
            '11:01': 20 + (index % 2)
        };
    });

    const normalized = counts.normalizeCounts(doc, game);
    assert.deepEqual(normalized.errors, []);

    const groups = counts.buildMarginalTables(normalized);
    assert.ok(groups.length > 0);
    groups.forEach((group) => {
        assert.equal(group.answers.length, 4);
        group.table.forEach((row) => {
            assert.equal(row.length, 4);
            assert.ok(row.reduce((a, b) => a + b, 0) >= 200);
        });
    });
});
