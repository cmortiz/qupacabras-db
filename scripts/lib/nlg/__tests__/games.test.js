const test = require('node:test');
const assert = require('node:assert/strict');

const { getGame } = require('../registry');
const { createColoringGame, colorAnswerBits } = require('../games/coloring');

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Neumaier compensated summation, so a weighted score is the correctly rounded
 * sum of the weights rather than a naive left to right accumulation.
 */
function compensatedSum(values) {
  let sum = 0;
  let comp = 0;
  for (let i = 0; i < values.length; i += 1) {
    const x = values[i];
    const t = sum + x;
    comp += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum;
    sum = t;
  }
  return sum + comp;
}

/**
 * Exhaustive search over deterministic strategy pairs.
 *
 * A strategy is an array indexed by the question a player receives, holding the
 * integer that player answers with. Both the unweighted win COUNT and the
 * weight aware value are tracked.
 *
 * Why both: for a uniform game the classical value is declared as an exact
 * rational (for example `1 - 1/(2n)`), and floating point summation of k copies
 * of fl(1/T) is NOT fl(k/T), even when the summation itself is correctly
 * rounded. So the exact assertion runs on `bestCount / questionCount` and the
 * weight aware path is checked to a few ULP. A future non-uniform game has no
 * count based value and would be asserted on `bestValue` alone.
 */
function bruteForceClassical(game, aliceStrategies, bobStrategies) {
  const questions = game.questions;
  let bestCount = 0;
  let bestValue = 0;
  for (let ai = 0; ai < aliceStrategies.length; ai += 1) {
    const alice = aliceStrategies[ai];
    for (let bi = 0; bi < bobStrategies.length; bi += 1) {
      const bob = bobStrategies[bi];
      let count = 0;
      let sum = 0;
      let comp = 0;
      for (let qi = 0; qi < questions.length; qi += 1) {
        const q = questions[qi];
        if (game.isWin(q, alice[q.x], bob[q.y])) {
          count += 1;
          const t = sum + q.weight;
          comp += Math.abs(sum) >= Math.abs(q.weight) ? (sum - t) + q.weight : (q.weight - t) + sum;
          sum = t;
        }
      }
      const value = sum + comp;
      if (count > bestCount) {
        bestCount = count;
      }
      if (value > bestValue) {
        bestValue = value;
      }
    }
  }
  return { bestCount: bestCount, bestValue: bestValue, questionCount: questions.length };
}

/** All `base ** size` functions from 0..size-1 to 0..base-1, as arrays. */
function allStrategies(size, base) {
  const total = Math.pow(base, size);
  const out = new Array(total);
  for (let code = 0; code < total; code += 1) {
    const strategy = new Array(size);
    let rest = code;
    for (let i = 0; i < size; i += 1) {
      strategy[i] = rest % base;
      rest = (rest - strategy[i]) / base;
    }
    out[code] = strategy;
  }
  return out;
}

/** All functions from 0..size-1 into a fixed alphabet of answer integers. */
function allStrategiesOver(size, alphabet) {
  const total = Math.pow(alphabet.length, size);
  const out = new Array(total);
  for (let code = 0; code < total; code += 1) {
    const strategy = new Array(size);
    let rest = code;
    for (let i = 0; i < size; i += 1) {
      const digit = rest % alphabet.length;
      strategy[i] = alphabet[digit];
      rest = (rest - digit) / alphabet.length;
    }
    out[code] = strategy;
  }
  return out;
}

/** Maximum number of edges properly colored by any `colors`-coloring. Exhaustive. */
function maxProperEdges(vertexCount, edges, colors) {
  const coloring = new Array(vertexCount).fill(0);
  const total = Math.pow(colors, vertexCount);
  let best = 0;
  for (let code = 0; code < total; code += 1) {
    let rest = code;
    for (let v = 0; v < vertexCount; v += 1) {
      coloring[v] = rest % colors;
      rest = (rest - coloring[v]) / colors;
    }
    let proper = 0;
    for (let e = 0; e < edges.length; e += 1) {
      if (coloring[edges[e][0]] !== coloring[edges[e][1]]) {
        proper += 1;
      }
    }
    if (proper > best) {
      best = proper;
    }
  }
  return best;
}

/** Structural invariants every registered game must satisfy. */
function assertWellFormed(game) {
  assert.ok(Array.isArray(game.questions), game.id + ': questions must be an array');
  assert.ok(game.questions.length > 0, game.id + ': must have at least one question');

  const keys = new Set();
  const weights = [];
  for (const q of game.questions) {
    assert.ok(Number.isSafeInteger(q.x) && q.x >= 0, game.id + ': x must be a non-negative integer');
    assert.ok(Number.isSafeInteger(q.y) && q.y >= 0, game.id + ': y must be a non-negative integer');
    // Pinned question-key encoding: "<x>|<y>", decimal, unpadded.
    assert.equal(q.key, q.x + '|' + q.y, game.id + ': question key encoding');
    assert.ok(!keys.has(q.key), game.id + ': duplicate question key ' + q.key);
    keys.add(q.key);
    assert.equal(q.weight, 1 / game.questions.length, game.id + ': uniform weight');
    weights.push(q.weight);
  }
  assert.ok(Math.abs(compensatedSum(weights) - 1) < 1e-12, game.id + ': weights must sum to 1');

  assert.ok(Number.isSafeInteger(game.aliceAnswerBits) && game.aliceAnswerBits >= 1);
  assert.ok(Number.isSafeInteger(game.bobAnswerBits) && game.bobAnswerBits >= 1);
  assert.ok(game.classicalValue > 0 && game.classicalValue <= 1);
  assert.ok(game.quantumValue === null || (game.quantumValue > 0 && game.quantumValue <= 1));
  if (game.quantumValue !== null) {
    assert.ok(game.quantumValue >= game.classicalValue,
      game.id + ': quantum value must not be below the classical value');
  }
}

/* ------------------------------------------------------------------ *
 * Odd cycle
 * ------------------------------------------------------------------ */

test('odd cycle: structure and answer width', () => {
  for (const n of [3, 5, 7, 9, 11, 99]) {
    const game = getGame('odd-cycle', { n: n });
    assert.equal(game.family, 'odd-cycle');
    assert.equal(game.label, 'Odd cycle C_' + n);
    // Each edge appears ONCE, so 2n questions, not 3n.
    assert.equal(game.questions.length, 2 * n, 'C_' + n + ' must have 2n questions');
    assert.equal(game.aliceAnswerBits, 1);
    assert.equal(game.bobAnswerBits, 1);
    assertWellFormed(game);

    const selfPairs = game.questions.filter((q) => q.x === q.y);
    const edgePairs = game.questions.filter((q) => q.x !== q.y);
    assert.equal(selfPairs.length, n);
    assert.equal(edgePairs.length, n);
    for (const q of edgePairs) {
      assert.equal(q.y, (q.x + 1) % n, 'edges run i -> i+1 only');
    }
  }
});

test('odd cycle: classical value 1 - 1/(2n), brute forced over all 2^n x 2^n strategy pairs', () => {
  const expected = {
    3: 0.8333333333333334,
    5: 0.9,
    7: 0.9285714285714286,
    9: 0.9444444444444444
  };
  for (const n of [3, 5, 7, 9]) {
    const game = getGame('odd-cycle', { n: n });
    const strategies = allStrategies(n, 2);
    assert.equal(strategies.length, Math.pow(2, n));

    const result = bruteForceClassical(game, strategies, strategies);
    assert.equal(result.bestCount, 2 * n - 1, 'C_' + n + ': best deterministic pair loses exactly one question');
    assert.equal(result.bestCount / result.questionCount, game.classicalValue,
      'C_' + n + ': brute forced classical value must equal the declared constant exactly');
    assert.equal(game.classicalValue, expected[n], 'C_' + n + ': declared constant');
    assert.equal(game.classicalValue, 1 - 1 / (2 * n));
    assert.ok(Math.abs(result.bestValue - game.classicalValue) <= 4 * Number.EPSILON,
      'C_' + n + ': weight aware value agrees to a few ULP');
  }
});

test('odd cycle n=5: isWin matches an independent reimplementation on every question and answer pair', () => {
  const n = 5;
  const game = getGame('odd-cycle', { n: n });

  function reference(q, a, b) {
    if (a !== 0 && a !== 1) { return false; }
    if (b !== 0 && b !== 1) { return false; }
    if (q.x === q.y) { return a === b; }
    return a !== b;
  }

  let checked = 0;
  for (const q of game.questions) {
    for (let a = 0; a <= 1; a += 1) {
      for (let b = 0; b <= 1; b += 1) {
        assert.equal(game.isWin(q, a, b), reference(q, a, b), q.key + ' a=' + a + ' b=' + b);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 2 * n * 4);
});

test('odd cycle: out of range answers lose rather than throw', () => {
  const game = getGame('odd-cycle', { n: 5 });
  const q = game.questions[0];
  for (const bad of [-1, 2, 1.5, NaN, Infinity, null, undefined, '1', true]) {
    assert.equal(game.isWin(q, bad, 0), false, 'alice answer ' + String(bad));
    assert.equal(game.isWin(q, 0, bad), false, 'bob answer ' + String(bad));
  }
});

test('odd cycle: quantum value is pinned to cos^2(pi / (4n)) with its citation', () => {
  // Previously null; pinned to the closed form published in Drmota, Grilo, Vidick et al.,
  // Phys. Rev. Lett. 134, 070201 (2025), arXiv:2406.08412, so the superquantum check compares
  // against the true bound instead of degrading to "not above 1".
  for (const n of [3, 5, 7, 13]) {
    const game = getGame('odd-cycle', { n });
    assert.equal(game.quantumValue, Math.pow(Math.cos(Math.PI / (4 * n)), 2),
      'C_' + n + ': quantum value must be the pinned closed form');
    assert.ok(game.quantumValue > game.classicalValue,
      'C_' + n + ': the quantum value must exceed the classical 1 - 1/(2n)');
  }
  const game = getGame('odd-cycle', { n: 5 });
  assert.equal(typeof game.reference.citation, 'string');
  assert.match(game.reference.citation, /Phys\. Rev\. Lett\. 134, 070201 \(2025\)/);
  assert.equal(game.reference.url, 'https://arxiv.org/abs/2406.08412');
});

/* ------------------------------------------------------------------ *
 * Magic square
 * ------------------------------------------------------------------ */

/** Bits of `value` as an array, MSB first, matching the pinned answer encoding. */
function bitsMsbFirst(value, width) {
  const text = value.toString(2).padStart(width, '0');
  const out = new Array(width);
  for (let i = 0; i < width; i += 1) {
    out[i] = text.charCodeAt(i) - 48;
  }
  return out;
}

/**
 * Independent reimplementation of the magic square rule, working from the
 * fixed-width bit STRING rather than from shifts, so it checks the "MSB first,
 * a0 leftmost" convention directly.
 */
function magicSquareReference(q, a, b) {
  if (!Number.isInteger(a) || a < 0 || a > 7) { return false; }
  if (!Number.isInteger(b) || b < 0 || b > 7) { return false; }
  const aBits = bitsMsbFirst(a, 3);
  const bBits = bitsMsbFirst(b, 3);
  if ((aBits[0] + aBits[1] + aBits[2]) % 2 !== 0) { return false; }
  if ((bBits[0] + bBits[1] + bBits[2]) % 2 !== 1) { return false; }
  // Alice holds row q.x, so her entry in column q.y is aBits[q.y].
  // Bob holds column q.y, so his entry in row q.x is bBits[q.x].
  return aBits[q.y] === bBits[q.x];
}

test('magic square: structure and answer width', () => {
  const game = getGame('magic-square');
  assert.equal(game.family, 'magic-square');
  assert.equal(game.questions.length, 9);
  assert.equal(game.aliceAnswerBits, 3);
  assert.equal(game.bobAnswerBits, 3);
  assertWellFormed(game);

  const keys = game.questions.map((q) => q.key).sort();
  assert.deepEqual(keys, ['0|0', '0|1', '0|2', '1|0', '1|1', '1|2', '2|0', '2|1', '2|2']);
});

test('magic square: classical value 8/9, brute forced over all 4^3 x 4^3 strategy pairs', () => {
  const game = getGame('magic-square');

  // Derived here, not imported: the four even parity and four odd parity
  // 3 bit values.
  const even = [];
  const odd = [];
  for (let v = 0; v <= 7; v += 1) {
    const bits = bitsMsbFirst(v, 3);
    if ((bits[0] + bits[1] + bits[2]) % 2 === 0) { even.push(v); } else { odd.push(v); }
  }
  assert.deepEqual(even, [0, 3, 5, 6]);
  assert.deepEqual(odd, [1, 2, 4, 7]);

  const aliceStrategies = allStrategiesOver(3, even);
  const bobStrategies = allStrategiesOver(3, odd);
  assert.equal(aliceStrategies.length, 64);
  assert.equal(bobStrategies.length, 64);

  const result = bruteForceClassical(game, aliceStrategies, bobStrategies);
  assert.equal(result.bestCount, 8, '9 of 9 is unreachable classically');
  assert.equal(result.bestCount / result.questionCount, game.classicalValue);
  assert.equal(game.classicalValue, 8 / 9);
  assert.equal(game.classicalValue, 0.8888888888888888);
  assert.ok(Math.abs(result.bestValue - game.classicalValue) <= 4 * Number.EPSILON);
  assert.equal(game.quantumValue, 1);
});

test('magic square: isWin matches an independent reimplementation on every question and answer pair', () => {
  const game = getGame('magic-square');
  let checked = 0;
  let wins = 0;
  for (const q of game.questions) {
    for (let a = 0; a <= 7; a += 1) {
      for (let b = 0; b <= 7; b += 1) {
        const got = game.isWin(q, a, b);
        assert.equal(got, magicSquareReference(q, a, b), q.key + ' a=' + a + ' b=' + b);
        if (got) { wins += 1; }
        checked += 1;
      }
    }
  }
  assert.equal(checked, 9 * 64);
  assert.ok(wins > 0, 'the rule must be satisfiable at all');
});

test('magic square: parity violations lose, they do not throw', () => {
  const game = getGame('magic-square');
  const q = game.questions[0];
  // 1 is odd parity, so it is invalid for Alice; 0 is even parity, invalid for Bob.
  assert.equal(game.isWin(q, 1, 1), false, 'Alice odd parity must lose');
  assert.equal(game.isWin(q, 0, 0), false, 'Bob even parity must lose');
  for (const bad of [-1, 8, 2.5, NaN, Infinity, null, undefined, '3', true]) {
    assert.equal(game.isWin(q, bad, 1), false, 'alice answer ' + String(bad));
    assert.equal(game.isWin(q, 0, bad), false, 'bob answer ' + String(bad));
  }
});

/* ------------------------------------------------------------------ *
 * Coloring: the classical value formula
 * ------------------------------------------------------------------ */

test('coloring: answer bit width is ceil(log2(c)), at least 1', () => {
  assert.equal(colorAnswerBits(2), 1);
  assert.equal(colorAnswerBits(3), 2);
  assert.equal(colorAnswerBits(4), 2);
  assert.equal(colorAnswerBits(5), 3);
  assert.equal(colorAnswerBits(8), 3);
  assert.equal(colorAnswerBits(9), 4);
});

test('coloring: (V + 2*maxProperEdges)/(V + 2E) is the classical value, brute forced on small graphs', () => {
  const cases = [
    {
      label: 'C_5 with 2 colors',
      vertexCount: 5,
      colors: 2,
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
      expectedMaxProperEdges: 4,
      // Enumerate every value the answer width can express, including any that
      // are out of range, to prove an out of range answer cannot help.
      fullWidthStrategies: true
    },
    {
      label: 'K_4 with 3 colors',
      vertexCount: 4,
      colors: 3,
      edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
      expectedMaxProperEdges: 5,
      fullWidthStrategies: true
    },
    {
      // 3 colorable, so the formula must give exactly 1. Enumerated over the
      // in-range answers only, to keep 5 vertices tractable.
      label: 'C_5 with 3 colors',
      vertexCount: 5,
      colors: 3,
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
      expectedMaxProperEdges: 5,
      fullWidthStrategies: false
    }
  ];

  for (const c of cases) {
    const questionCount = c.vertexCount + 2 * c.edges.length;
    const mpe = maxProperEdges(c.vertexCount, c.edges, c.colors);
    assert.equal(mpe, c.expectedMaxProperEdges, c.label + ': maxProperEdges');

    const formula = (c.vertexCount + 2 * mpe) / questionCount;
    const game = createColoringGame({
      id: 'test',
      name: 'test',
      params: {},
      family: 'coloring',
      label: c.label,
      vertexCount: c.vertexCount,
      edges: c.edges,
      colors: c.colors,
      classicalValue: formula,
      quantumValue: null
    });

    assert.equal(game.questions.length, questionCount, c.label + ': V + 2E questions');
    assert.equal(game.aliceAnswerBits, colorAnswerBits(c.colors));

    const alphabetSize = c.fullWidthStrategies ? Math.pow(2, game.aliceAnswerBits) : c.colors;
    const answerAlphabet = [];
    for (let v = 0; v < alphabetSize; v += 1) {
      answerAlphabet.push(v);
    }
    const strategies = allStrategiesOver(c.vertexCount, answerAlphabet);
    const result = bruteForceClassical(game, strategies, strategies);

    assert.equal(result.bestCount / result.questionCount, formula,
      c.label + ': brute forced classical value must equal the formula exactly');
    assert.ok(Math.abs(result.bestValue - formula) <= 4 * Number.EPSILON, c.label + ': weight aware value');
  }
});

test('coloring: an answer at or above the color count loses', () => {
  const game = createColoringGame({
    id: 'test', name: 'test', params: {}, family: 'coloring', label: 'triangle with 3 colors',
    vertexCount: 3, edges: [[0, 1], [1, 2], [2, 0]], colors: 3, classicalValue: 1, quantumValue: null
  });
  assert.equal(game.aliceAnswerBits, 2, '3 colors still costs 2 bits, so 3 is expressible but invalid');
  const selfQuestion = game.questions.find((q) => q.x === q.y);
  const edgeQuestion = game.questions.find((q) => q.x !== q.y);
  assert.equal(game.isWin(selfQuestion, 3, 3), false, 'agreeing on an out of range color still loses');
  assert.equal(game.isWin(edgeQuestion, 3, 0), false);
  assert.equal(game.isWin(edgeQuestion, 0, 3), false);
  assert.equal(game.isWin(selfQuestion, 2, 2), true);
  assert.equal(game.isWin(edgeQuestion, 0, 1), true);
});

test('coloring: malformed graphs are rejected at build time', () => {
  const base = {
    id: 't', name: 't', params: {}, family: 'coloring', label: 't',
    vertexCount: 3, edges: [[0, 1]], colors: 3, classicalValue: 1, quantumValue: null
  };
  const bad = [
    Object.assign({}, base, { edges: [[0, 0]] }),
    Object.assign({}, base, { edges: [[0, 3]] }),
    Object.assign({}, base, { edges: [[0, 1], [1, 0]] }),
    Object.assign({}, base, { edges: [[0, 1, 2]] }),
    Object.assign({}, base, { colors: 1 }),
    Object.assign({}, base, { vertexCount: 0 }),
    Object.assign({}, base, { classicalValue: 1.5 }),
    Object.assign({}, base, { quantumValue: 2 })
  ];
  for (let i = 0; i < bad.length; i += 1) {
    assert.throws(() => createColoringGame(bad[i]), (err) => {
      assert.equal(err.code, 'BAD_GAME_DEF', 'case ' + i + ': ' + err.message);
      return true;
    }, 'case ' + i + ' should have thrown');
  }
});

/* ------------------------------------------------------------------ *
 * G14
 * ------------------------------------------------------------------ */

/**
 * Second, independent transcription of `nlg_data_extracted/data/games/g14/g14.nx`,
 * written here in sorted order rather than the file's order so that a
 * transcription slip in `games/g14.js` cannot be reproduced by copying.
 */
const G14_EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 13],
  [1, 2], [1, 5], [1, 6], [1, 13],
  [2, 7], [2, 8], [2, 13],
  [3, 4], [3, 10], [3, 11], [3, 13],
  [4, 9], [4, 12], [4, 13],
  [5, 6], [5, 11], [5, 12], [5, 13],
  [6, 9], [6, 10], [6, 13],
  [7, 8], [7, 10], [7, 12], [7, 13],
  [8, 9], [8, 11], [8, 13],
  [9, 13],
  [10, 13],
  [11, 13],
  [12, 13]
];

test('G14: structure matches the edge list exactly', () => {
  assert.equal(G14_EDGES.length, 37, 'g14.nx has 37 undirected edges');
  const game = getGame('g14');

  assert.equal(game.id, 'g14');
  assert.equal(game.family, 'coloring');
  assert.equal(game.aliceAnswerBits, 2, '4 colors is exactly 2 bits');
  assert.equal(game.bobAnswerBits, 2);
  assert.equal(game.questions.length, 88, '14 vertices + 2 * 37 edges');
  assertWellFormed(game);

  const selfPairs = game.questions.filter((q) => q.x === q.y);
  const edgePairs = game.questions.filter((q) => q.x !== q.y);
  assert.equal(selfPairs.length, 14);
  assert.equal(edgePairs.length, 74, 'every edge appears in BOTH directions');

  // Re-derive the expected question set from the independent literal above.
  const expected = new Set();
  for (let v = 0; v < 14; v += 1) {
    expected.add(v + '|' + v);
  }
  for (const [u, v] of G14_EDGES) {
    expected.add(u + '|' + v);
    expected.add(v + '|' + u);
  }
  assert.equal(expected.size, 88, 'the edge list implies exactly 88 distinct questions');

  const actual = new Set(game.questions.map((q) => q.key));
  assert.equal(actual.size, 88, 'all 88 question keys are unique');
  const missing = [...expected].filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expected.has(k));
  assert.deepEqual(missing, [], 'questions missing from the built game');
  assert.deepEqual(extra, [], 'questions the edge list does not imply');
});

test('G14: declared bounds and reference', () => {
  const game = getGame('g14');
  assert.equal(game.classicalValue, 43 / 44);
  assert.equal(game.classicalValue, 0.9772727272727273);
  // The coloring formula with the separately verified maxProperEdges = 36.
  assert.equal(game.classicalValue, (14 + 2 * 36) / 88);
  assert.equal(game.quantumValue, 1);
  assert.deepEqual(game.reference, {
    citation: 'L. Mančinska and D. E. Roberson, Baltic Journal on Modern Computing, 4(4), 846-859, 2016',
    url: 'https://arxiv.org/abs/1801.03542'
  });
});

test('G14: isWin matches an independent reimplementation on every question and answer pair', () => {
  const game = getGame('g14');

  function reference(q, a, b) {
    if (!Number.isInteger(a) || a < 0 || a > 3) { return false; }
    if (!Number.isInteger(b) || b < 0 || b > 3) { return false; }
    if (q.x === q.y) { return a === b; }
    return a !== b;
  }

  let checked = 0;
  for (const q of game.questions) {
    for (let a = 0; a <= 3; a += 1) {
      for (let b = 0; b <= 3; b += 1) {
        assert.equal(game.isWin(q, a, b), reference(q, a, b), q.key + ' a=' + a + ' b=' + b);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 88 * 16);

  for (const bad of [-1, 4, 1.5, NaN, Infinity, null, undefined, '2', true]) {
    assert.equal(game.isWin(game.questions[0], bad, 0), false, 'alice answer ' + String(bad));
    assert.equal(game.isWin(game.questions[0], 0, bad), false, 'bob answer ' + String(bad));
  }
});
