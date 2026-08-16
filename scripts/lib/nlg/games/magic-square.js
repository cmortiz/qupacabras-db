/**
 * Mermin-Peres magic square game.
 *
 * The referee draws a question pair (i, j) uniformly from the 9 pairs with
 * i, j in 0..2. Alice receives row index i, Bob receives column index j.
 *
 * Alice answers with the three entries of row i, Bob with the three entries of
 * column j. Each answer is 3 bits.
 *
 * BIT CONVENTION (pinned by the counts encoding, stated here because getting it
 * wrong is silent). The counts encoding writes an answer as a fixed width,
 * zero padded binary string, MSB first, with a0 leftmost. So bit index k of an
 * answer is read from the integer as
 *
 *   entry(value, k) = (value >>> (BITS - 1 - k)) & 1        // BITS = 3
 *
 * Index 0 is therefore the MOST significant bit of the 3 bit integer, and the
 * integer 0b101 = 5 spells the string "101", whose entries are
 * (index 0, index 1, index 2) = (1, 0, 1).
 *
 * Alice's answer to row i is (A[i][0], A[i][1], A[i][2]), so her entry at
 * COLUMN j is entry(a, j).
 * Bob's answer to column j is (B[0][j], B[1][j], B[2][j]), so his entry at
 * ROW i is entry(b, i).
 *
 * Constraints. Alice's three bits must have EVEN parity (each row sums to 0
 * mod 2), Bob's three bits must have ODD parity (each column sums to 1 mod 2).
 * A parity violation LOSES the round; it does not throw, because answers come
 * from submitted measurement data and a submitter must not be able to crash the
 * verifier with an out of protocol answer key.
 *
 * Win condition: the players' entries agree at the intersection cell (i, j),
 * that is entry(a, j) === entry(b, i).
 *
 * Classical value: exactly 8/9. The nine parity constraints are jointly
 * unsatisfiable (summing all six gives 0 = 1 mod 2), so no deterministic
 * strategy pair wins all nine questions, and eight is achievable. Confirmed by
 * exhaustive search over all 4^3 x 4^3 strategy pairs (four even parity triples
 * per row for Alice, four odd parity triples per column for Bob) in
 * `__tests__/games.test.js`.
 *
 * Quantum value: exactly 1. The standard Mermin-Peres observable assignment
 * wins every round, which is what makes this a pseudo-telepathy game; the
 * separation 8/9 versus 1 is the defining property of the game and is not a
 * numerical constant that could be misremembered.
 */

const ANSWER_BITS = 3;
const SIZE = 3;
const QUESTION_COUNT = SIZE * SIZE;
const MAX_ANSWER = (1 << ANSWER_BITS) - 1;

/**
 * Entry k of a 3 bit answer, MSB first (index 0 is the leftmost bit).
 *
 * @param {number} value 3 bit answer as an integer
 * @param {number} index 0, 1 or 2
 * @returns {number} 0 or 1
 */
function entry(value, index) {
  return (value >>> (ANSWER_BITS - 1 - index)) & 1;
}

function parity(value) {
  return (entry(value, 0) ^ entry(value, 1) ^ entry(value, 2)) & 1;
}

function inRange(answer) {
  return Number.isInteger(answer) && answer >= 0 && answer <= MAX_ANSWER;
}

function isWin(q, a, b) {
  if (!inRange(a) || !inRange(b)) {
    return false;
  }
  // Alice's row must have even parity, Bob's column odd parity.
  if (parity(a) !== 0 || parity(b) !== 1) {
    return false;
  }
  // q.x is Alice's row i, q.y is Bob's column j.
  // Alice's entry at column j must equal Bob's entry at row i.
  return entry(a, q.y) === entry(b, q.x);
}

function build(id, params) {
  const weight = 1 / QUESTION_COUNT;
  const questions = [];
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      questions.push({ key: i + '|' + j, x: i, y: j, weight: weight });
    }
  }

  return {
    id: id,
    name: 'magic-square',
    params: params,
    family: 'magic-square',
    label: 'Mermin-Peres magic square',
    aliceAnswerBits: ANSWER_BITS,
    bobAnswerBits: ANSWER_BITS,
    questions: questions,
    isWin: isWin,
    classicalValue: 8 / 9,
    quantumValue: 1
  };
}

module.exports = {
  name: 'magic-square',
  family: 'magic-square',
  label: 'Mermin-Peres magic square',
  params: Object.freeze([]),
  build: build
};
