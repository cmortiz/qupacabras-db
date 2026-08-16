# Adding a nonlocal game

Four steps: one new file here, one line in `../registry.js`, one brute-force test, one structural
test. Nothing else in the verification core needs to change.

## 1. Create `games/<name>.js`

The module exports a registration record. The registry validates parameters and freezes the result,
so `build` may assume its `params` argument is already an object of bounds-checked safe integers.

```js
module.exports = {
  name: 'chsh',                 // the registry key a submission supplies
  family: 'chsh',               // groups variants of the same rule
  label: 'CHSH',                // short human-readable name for a UI
  params: Object.freeze([]),    // param specs, see below
  build: function build(id, params) { /* returns a NonlocalGameDef */ }
};
```

`build` returns a `NonlocalGameDef`:

```js
{
  id,                 // canonical string the registry passed in, e.g. "odd-cycle:n=5"
  name,               // must equal the module's `name`
  params,             // the resolved params object the registry passed in
  family,             // must equal the module's `family`
  label,              // may depend on params, e.g. "Odd cycle C_5"
  aliceAnswerBits,    // fixed answer width in bits
  bobAnswerBits,
  questions,          // [{ key, x, y, weight }]
  isWin,              // (q, a, b) -> boolean
  classicalValue,     // number in (0, 1]
  quantumValue,       // number in (0, 1], or null
  reference           // optional { citation, url }
}
```

Rules the registry does not enforce and a reviewer must check:

- `questions[].key` is the pinned question-key encoding, `"<x>|<y>"`, decimal, unpadded.
- `questions[].weight` is the question's probability weight, and the weights sum to 1. A uniform
  game uses `1 / questions.length` throughout. The field is always present, so a non-uniform game
  can be added without changing any consumer.
- `isWin` returns `false` for an out-of-protocol answer (out of range, wrong parity, not an
  integer) and never throws. Answers come from submitted measurement data, so a malformed answer key
  must cost the submitter a win instead of crashing the verifier.
- `classicalValue` and `quantumValue` are constants with a stated provenance in a comment. A value
  that cannot be pinned to vendored data or a cited source is `null`. A `null` `quantumValue` makes
  the superquantum check degrade to "the win rate must not exceed 1", which is weaker than the true
  bound and still never rejects a legitimate result.

### Param specs

Each entry of `params` describes one integer parameter:

```js
{ name: 'n', type: 'integer', min: 3, max: 99, default: 5, odd: true,
  description: 'One line, shown by describeParams.' }
```

`type` is always `"integer"`. The registry accepts only a safe integer inside `[min, max]`, so
non-integers, negatives, `NaN`, `Infinity`, numeric strings and unknown parameter names all raise
`BAD_PARAM`. `odd: true` is the only extra constraint so far. Add another by extending
`resolveParams` in `../registry.js`, keeping validation out of the game modules.

### Fixed-width answer keys

`aliceAnswerBits` and `bobAnswerBits` are the fixed answer widths the counts encoding zero-pads to,
MSB first, `a0` leftmost. The width is mandatory. Once it is dropped, `"01"` and `"1"` name the same
answer, a submitter can split one bin across two keys, and the recomputed win rate stops matching
the measured data. Four colours is exactly 2 bits. Compute the width with shifts so no floating
point rounding can move a boundary.

### Edge conventions

Two conventions exist in this directory and they are not interchangeable. `coloring.js` emits every
edge in both directions, giving `V + 2E` questions. `odd-cycle.js` emits every edge once, giving
`2n` questions. The two question distributions carry different classical bounds, and picking the
wrong one shifts the bound silently: the game still builds, and every win rate computed against it
is wrong by a few percent. State the convention in a comment at the top of the file and assert the
question count in the test.

## 2. Register it in `../registry.js`

One line next to the others, `GAMES['chsh'] = chsh;`, plus the matching `require` at the top of the
file.

The table has a null prototype and every lookup
is guarded with `Object.prototype.hasOwnProperty.call`, so a submission naming `"__proto__"`,
`"constructor"` or `"toString"` throws `UNKNOWN_GAME`. Keep both properties: do not switch the table
to an object literal, and do not read from it without the guard.

## 3. Add the tests

In `../__tests__/games.test.js`, three checks:

- Brute force. Enumerate every deterministic strategy pair and assert the maximum equals the
  declared `classicalValue`. This catches a wrong bound, a wrong edge convention and a wrong bit
  convention at once. When the strategy space is too large, assert the structure exhaustively and
  brute-force a smaller instance of the same family, which is what `G14` does.
- Structure. `assertWellFormed`, plus the question count, the answer widths and the question keys.
- Agreement. An independent reimplementation of the win rule, compared against `isWin` on every
  question and every answer pair the bit widths can express.

In `../__tests__/registry.test.js`, extend the `listGames` assertion and add the `BAD_PARAM` cases
for any new parameter.

## 4. Worked example: CHSH

A complete game, copyable as a starting point. Both players receive one bit and answer one bit, and
they win when `a XOR b == x AND y`.

```js
const QUESTIONS = [[0, 0], [0, 1], [1, 0], [1, 1]];

function isWin(q, a, b) {
  if (a !== 0 && a !== 1) { return false; }
  if (b !== 0 && b !== 1) { return false; }
  return ((a ^ b) & 1) === ((q.x & q.y) & 1);
}

function build(id, params) {
  const weight = 1 / QUESTIONS.length;
  return {
    id: id, name: 'chsh', params: params, family: 'chsh', label: 'CHSH',
    aliceAnswerBits: 1,
    bobAnswerBits: 1,
    questions: QUESTIONS.map(function (pair) {
      return { key: pair[0] + '|' + pair[1], x: pair[0], y: pair[1], weight: weight };
    }),
    isWin: isWin,
    classicalValue: 3 / 4,   // brute forced over all 4 x 4 deterministic strategy pairs
    quantumValue: null       // the Tsirelson value is not pinned to a source here
  };
}

module.exports = { name: 'chsh', family: 'chsh', label: 'CHSH', params: Object.freeze([]), build: build };
```

The matching test enumerates all `2^2` Alice strategies against all `2^2` Bob strategies over the 2
questions per player, and asserts the maximum is exactly `3/4`.

## Note on exact comparison in tests

The brute-force helper reports both an unweighted win count and a compensated weighted sum. Assert
exactness on `bestCount / questionCount`, and check the weighted path to a few ULP: floating point
summation of `k` copies of `fl(1/T)` differs from `fl(k/T)` even when correctly rounded, so a
weighted sum has no exact comparison against a declared rational like `1 - 1/(2n)`. A genuinely
non-uniform game has no count-based value and is asserted on the weighted sum alone.
