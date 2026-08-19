/**
 * Odd cycle game on C_n, n odd.
 *
 * The referee draws a question pair (x, y) uniformly from:
 *
 *   - the n "same vertex" pairs (i, i) for i in 0..n-1, and
 *   - the n cycle edges (i, (i + 1) mod n) for i in 0..n-1, each edge taken
 *     ONCE, in the single orientation i -> i+1.
 *
 * That is 2n questions. Note the contrast with `coloring.js`, which takes each
 * edge in BOTH directions. The two conventions give different question
 * distributions and therefore different classical bounds, so the convention is
 * fixed per game and stated here rather than inferred. Getting it backwards
 * shifts the bound silently. See games/README.md.
 *
 * Win condition:
 *
 *   x === y  ->  win iff a === b   (the players agree on the color of a vertex)
 *   x !== y  ->  win iff a !== b   (adjacent vertices get different colors)
 *
 * Answers are single bits, 0 or 1: this is the two coloring game on an odd
 * cycle, which has no proper two coloring, which is what makes it interesting.
 * An answer outside {0, 1} is out of range and LOSES rather than throwing,
 * because answers come from submitted measurement data.
 *
 * Classical value: exactly 1 - 1/(2n). A deterministic strategy pair is a pair
 * of two colorings; the best pair loses exactly one of the 2n questions.
 * Confirmed by exhaustive search over all 2^n x 2^n deterministic strategy
 * pairs at n = 3, 5, 7, 9 in `__tests__/games.test.js`:
 * 0.8333333333333334, 0.9, 0.9285714285714286, 0.9444444444444444.
 */

const ANSWER_BITS = 1;

const PARAMS = Object.freeze([
  Object.freeze({
    name: 'n',
    type: 'integer',
    min: 3,
    max: 99,
    default: 5,
    odd: true,
    description: 'Number of vertices in the cycle. Must be an odd integer, since an even cycle is two colorable and the game becomes trivial.'
  })
]);

function inRange(answer) {
  return answer === 0 || answer === 1;
}

function isWin(q, a, b) {
  if (!inRange(a) || !inRange(b)) {
    return false;
  }
  if (q.x === q.y) {
    return a === b;
  }
  return a !== b;
}

/**
 * Source of the quantum value below. The closed form covers every odd n at
 * once, which is why the constant can be pinned per parameter without a
 * per-instance table.
 */
const REFERENCE = {
  citation: 'Drmota, Grilo, Vidick et al., Phys. Rev. Lett. 134, 070201 (2025)',
  url: 'https://arxiv.org/abs/2406.08412'
};

function build(id, params) {
  const n = params.n;
  const questionCount = 2 * n;
  const weight = 1 / questionCount;
  const questions = [];
  for (let i = 0; i < n; i += 1) {
    questions.push({ key: i + '|' + i, x: i, y: i, weight: weight });
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    questions.push({ key: i + '|' + j, x: i, y: j, weight: weight });
  }

  return {
    id: id,
    name: 'odd-cycle',
    params: params,
    family: 'odd-cycle',
    label: 'Odd cycle C_' + n,
    aliceAnswerBits: ANSWER_BITS,
    bobAnswerBits: ANSWER_BITS,
    questions: questions,
    isWin: isWin,
    classicalValue: 1 - 1 / (2 * n),

    /**
     * Optimal quantum value: exactly cos^2(pi / (4n)). Pinned to a published
     * closed form rather than a constant written from memory: Drmota, Grilo,
     * Vidick et al., Phys. Rev. Lett. 134, 070201 (2025), arXiv:2406.08412,
     * carried machine-readably in REFERENCE above. This value was previously
     * null, which made the superquantum check degrade to "the win rate must
     * not exceed 1"; pinning it tightens that check to the true bound, so a
     * win rate materially above cos^2(pi / (4n)) is now flagged as
     * impossible rather than accepted. It exceeds the classical 1 - 1/(2n)
     * for every odd n >= 3, since sin^2(pi / (4n)) < (pi / (4n))^2 < 1/(2n)
     * there, and `assertWellFormed` in `__tests__/games.test.js` checks the
     * ordering on every instance it builds.
     */
    quantumValue: Math.pow(Math.cos(Math.PI / (4 * n)), 2),
    reference: REFERENCE
  };
}

module.exports = {
  name: 'odd-cycle',
  family: 'odd-cycle',
  label: 'Odd cycle',
  params: PARAMS,
  build: build
};
