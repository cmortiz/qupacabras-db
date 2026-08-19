const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../registry');
const { listGames, getGame, describeParams } = registry;

/**
 * Assert that `fn` throws an Error carrying the expected `.code`.
 */
function assertCode(fn, code, label) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof Error, label + ': expected an Error, got ' + String(err));
    assert.equal(err.code, code, label + ': expected code ' + code + ', got ' +
      String(err.code) + ' (message: ' + err.message + ')');
    return true;
  }, label + ': expected a throw');
}

/**
 * Attempt a mutation that a frozen object must reject.
 *
 * A frozen object rejects a write silently in sloppy mode and by throwing in
 * strict mode, and some builtins (Array.prototype.push) throw either way. The
 * swallowed error keeps the test agnostic; the assertions that follow check the
 * value is unchanged, which is the property that actually matters.
 */
function attemptMutation(fn) {
  try {
    fn();
  } catch {
    // Rejected by the freeze, which is the point.
  }
}

/* ------------------------------------------------------------------ *
 * listGames
 * ------------------------------------------------------------------ */

// Do not snapshot the registry. Registering a game is an ordinary, additive change that breaks
// nothing, and a membership assertion turns it into a red `npm run test:scripts` on both matrix
// legs and in .husky/pre-commit. What must hold whatever is registered is asserted instead: the
// list is sorted, unique and non-empty, every name on it resolves, and every definition it
// resolves to is well formed. This is the same rule io.test.js already applies to the corpus.

test('listGames returns a sorted, unique, non-empty list of names', () => {
  const names = listGames();

  assert.ok(Array.isArray(names), 'must be an array');
  assert.ok(names.length > 0, 'the registry must not be empty');
  for (const name of names) {
    assert.equal(typeof name, 'string', 'every name must be a string, got ' + typeof name);
    assert.notEqual(name, '', 'no name may be empty');
  }
  assert.deepEqual(names, names.slice().sort(), 'must be sorted');
  assert.equal(new Set(names).size, names.length, 'must be free of repeats');
});

test('listGames returns a fresh array each call', () => {
  const before = listGames();
  const first = listGames();
  first.push('injected');
  first[0] = 'tampered';
  assert.deepEqual(listGames(), before);
});

test('every registered game resolves to a well-formed definition with a unique id', () => {
  const ids = new Set();

  for (const name of listGames()) {
    const game = getGame(name);
    const at = name + ': ';

    assert.equal(game.name, name, at + 'name must be the registry key');
    assert.equal(typeof game.id, 'string', at + 'id must be a string');
    assert.ok(game.id.startsWith(name), at + 'id must begin with the registry key');
    assert.ok(!ids.has(game.id), at + 'duplicate canonical id ' + game.id);
    ids.add(game.id);

    assert.equal(typeof game.family, 'string', at + 'family');
    assert.equal(typeof game.label, 'string', at + 'label');
    assert.equal(typeof game.isWin, 'function', at + 'isWin');
    assert.ok(Number.isSafeInteger(game.aliceAnswerBits) && game.aliceAnswerBits >= 1,
      at + 'aliceAnswerBits');
    assert.ok(Number.isSafeInteger(game.bobAnswerBits) && game.bobAnswerBits >= 1,
      at + 'bobAnswerBits');

    assert.ok(Array.isArray(game.questions) && game.questions.length > 0, at + 'questions');
    const keys = new Set();
    for (const q of game.questions) {
      assert.ok(Number.isSafeInteger(q.x) && q.x >= 0, at + 'question x');
      assert.ok(Number.isSafeInteger(q.y) && q.y >= 0, at + 'question y');
      assert.equal(q.key, q.x + '|' + q.y, at + 'question key encoding');
      assert.ok(!keys.has(q.key), at + 'duplicate question key ' + q.key);
      keys.add(q.key);
      assert.ok(q.weight > 0, at + 'question weight must be positive');
    }

    assert.ok(game.classicalValue > 0 && game.classicalValue <= 1, at + 'classicalValue');
    assert.ok(game.quantumValue === null ||
      (game.quantumValue >= game.classicalValue && game.quantumValue <= 1),
      at + 'quantumValue must be null or in [classicalValue, 1]');

    assert.ok(Object.isFrozen(game), at + 'definition must be frozen');
  }
});

/* ------------------------------------------------------------------ *
 * Canonical ids and caching
 * ------------------------------------------------------------------ */

test('canonical ids are stable strings derived from name and params', () => {
  assert.equal(getGame('g14').id, 'g14');
  assert.equal(getGame('magic-square').id, 'magic-square');
  assert.equal(getGame('odd-cycle', { n: 5 }).id, 'odd-cycle:n=5');
  assert.equal(getGame('odd-cycle', { n: 7 }).id, 'odd-cycle:n=7');
});

test('omitted params fall back to the declared default', () => {
  const explicit = getGame('odd-cycle', { n: 5 });
  assert.equal(getGame('odd-cycle').id, 'odd-cycle:n=5');
  assert.equal(getGame('odd-cycle', {}).id, 'odd-cycle:n=5');
  assert.equal(getGame('odd-cycle', undefined), explicit);
  assert.equal(getGame('odd-cycle', null), explicit);
});

test('getGame caches on the canonical id and returns an identical reference', () => {
  assert.equal(getGame('g14'), getGame('g14'));
  assert.equal(getGame('magic-square'), getGame('magic-square'));
  assert.equal(getGame('odd-cycle', { n: 9 }), getGame('odd-cycle', { n: 9 }));
  assert.notEqual(getGame('odd-cycle', { n: 9 }), getGame('odd-cycle', { n: 11 }));
});

/* ------------------------------------------------------------------ *
 * Freezing
 * ------------------------------------------------------------------ */

test('getGame returns a deeply frozen definition', () => {
  const game = getGame('odd-cycle', { n: 5 });

  assert.ok(Object.isFrozen(game), 'the definition itself');
  assert.ok(Object.isFrozen(game.params), 'params');
  assert.ok(Object.isFrozen(game.questions), 'questions array');
  for (const q of game.questions) {
    assert.ok(Object.isFrozen(q), 'question ' + q.key);
  }
  assert.ok(Object.isFrozen(getGame('g14').reference), 'reference');
});

test('mutating a returned definition does not change it', () => {
  const game = getGame('odd-cycle', { n: 7 });
  const questionCount = game.questions.length;
  const firstKey = game.questions[0].key;
  const firstX = game.questions[0].x;

  attemptMutation(() => { game.questions.push({ key: '99|99', x: 99, y: 99, weight: 1 }); });
  attemptMutation(() => { game.questions[0] = null; });
  attemptMutation(() => { game.questions[0].x = 42; });
  attemptMutation(() => { game.questions[0].key = 'tampered'; });
  attemptMutation(() => { game.params.n = 3; });
  attemptMutation(() => { game.params.extra = 1; });
  attemptMutation(() => { game.classicalValue = 1; });
  attemptMutation(() => { delete game.isWin; });

  assert.equal(game.questions.length, questionCount);
  assert.equal(game.questions[0].key, firstKey);
  assert.equal(game.questions[0].x, firstX);
  assert.deepEqual(game.params, { n: 7 });
  assert.equal(game.classicalValue, 1 - 1 / 14);
  assert.equal(typeof game.isWin, 'function');

  // And the cached instance the next caller gets is the same untouched object.
  assert.equal(getGame('odd-cycle', { n: 7 }), game);
  assert.equal(getGame('odd-cycle', { n: 7 }).questions.length, questionCount);
});

/* ------------------------------------------------------------------ *
 * UNKNOWN_GAME
 * ------------------------------------------------------------------ */

test('unknown names throw UNKNOWN_GAME', () => {
  // Filtered against the registry rather than hardcoded: 'coloring' is a game family here and a
  // plausible future registry key, and a name that becomes real must not fail this test.
  const registered = new Set(listGames());
  const candidates = ['', 'nope', 'G14', 'oddcycle', 'coloring', 'games/g14', 'odd-cycle ']
    .filter((name) => !registered.has(name));

  assert.ok(candidates.length > 0, 'every candidate unknown name is now registered');
  for (const name of candidates) {
    assertCode(() => getGame(name), 'UNKNOWN_GAME', 'name ' + JSON.stringify(name));
  }
});

test('prototype-inherited names throw UNKNOWN_GAME, they do not resolve', () => {
  // The dispatch table has a null prototype and every lookup is guarded with an
  // own-property check, so none of these can reach anything.
  for (const name of ['__proto__', 'constructor', 'toString']) {
    assertCode(() => getGame(name), 'UNKNOWN_GAME', 'name ' + JSON.stringify(name));
    assertCode(() => getGame(name, {}), 'UNKNOWN_GAME', 'name ' + JSON.stringify(name) + ' with params');
    assert.equal(describeParams(name), null, 'describeParams(' + JSON.stringify(name) + ')');
  }
  // The wider family of inherited names, for good measure.
  for (const name of ['valueOf', 'hasOwnProperty', 'propertyIsEnumerable', 'isPrototypeOf', 'toLocaleString']) {
    assertCode(() => getGame(name), 'UNKNOWN_GAME', 'name ' + JSON.stringify(name));
  }
});

test('non-string names throw UNKNOWN_GAME', () => {
  const values = [undefined, null, 42, 0, true, false, {}, [], ['g14'], Symbol('g14'), () => 'g14'];
  for (const value of values) {
    assertCode(() => getGame(value), 'UNKNOWN_GAME', 'name of type ' + typeof value);
  }
  // A String object is not a string primitive and must not dispatch either.
  assertCode(() => getGame(Object('g14')), 'UNKNOWN_GAME', 'String object');
});

/* ------------------------------------------------------------------ *
 * BAD_PARAM
 * ------------------------------------------------------------------ */

test('non-integer, out-of-range and coercible params throw BAD_PARAM', () => {
  const cases = [
    ['non-integer', 5.5],
    ['non-integer, tiny fraction', 5.0000001],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['negative', -5],
    ['negative one', -1],
    ['zero', 0],
    ['below min', 2],
    ['above max', 101],
    ['just above max', 100],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 2],
    ['numeric string', '5'],
    ['numeric string, padded', ' 5 '],
    ['empty string', ''],
    ['boolean true', true],
    ['null', null],
    ['undefined explicit', undefined],
    ['object', {}],
    ['array', [5]],
    ['bigint', BigInt(5)],
    ['boxed number', Object(5)]
  ];
  for (const [label, value] of cases) {
    assertCode(() => getGame('odd-cycle', { n: value }), 'BAD_PARAM', 'n = ' + label);
  }
});

test('even n throws BAD_PARAM for the odd cycle', () => {
  for (const n of [4, 6, 8, 10, 98]) {
    assertCode(() => getGame('odd-cycle', { n: n }), 'BAD_PARAM', 'n = ' + n);
  }
  // The boundaries themselves are fine.
  assert.equal(getGame('odd-cycle', { n: 3 }).id, 'odd-cycle:n=3');
  assert.equal(getGame('odd-cycle', { n: 99 }).id, 'odd-cycle:n=99');
});

test('unknown parameter names throw BAD_PARAM', () => {
  assertCode(() => getGame('odd-cycle', { m: 5 }), 'BAD_PARAM', 'misspelled param');
  assertCode(() => getGame('odd-cycle', { n: 5, extra: 1 }), 'BAD_PARAM', 'extra param');
  assertCode(() => getGame('g14', { n: 5 }), 'BAD_PARAM', 'param for a parameterless game');
  assertCode(() => getGame('magic-square', { size: 3 }), 'BAD_PARAM', 'param for a parameterless game');
});

test('a "__proto__" key in the params object is a BAD_PARAM, not a prototype write', () => {
  // JSON.parse produces a real own property named "__proto__", which is exactly
  // what a submitted counts/benchmark file would carry.
  const injected = JSON.parse('{"__proto__": {"polluted": true}}');
  assertCode(() => getGame('odd-cycle', injected), 'BAD_PARAM', '__proto__ param key');
  assertCode(() => getGame('g14', injected), 'BAD_PARAM', '__proto__ param key');
  assert.equal({}.polluted, undefined, 'Object.prototype must be untouched');

  const constructorKey = JSON.parse('{"constructor": 1}');
  assertCode(() => getGame('odd-cycle', constructorKey), 'BAD_PARAM', 'constructor param key');
});

test('params that are not a plain object throw BAD_PARAM', () => {
  for (const params of [5, 'n=5', true, [5], [], Symbol('x'), () => ({ n: 5 })]) {
    assertCode(() => getGame('odd-cycle', params), 'BAD_PARAM', 'params of type ' + typeof params);
  }
});

test('a game with no params still accepts an empty object or nothing', () => {
  assert.equal(getGame('g14'), getGame('g14', {}));
  assert.equal(getGame('g14'), getGame('g14', null));
  assert.deepEqual(getGame('g14').params, {});
  assert.deepEqual(getGame('magic-square').params, {});
});

/* ------------------------------------------------------------------ *
 * describeParams
 * ------------------------------------------------------------------ */

test('describeParams returns null for unknown names and never throws', () => {
  for (const name of ['nope', '', '__proto__', 'constructor', 'toString', 'valueOf',
    undefined, null, 42, {}, [], Symbol('g14')]) {
    assert.equal(describeParams(name), null, 'describeParams(' + String(typeof name) + ')');
  }
});

test('describeParams describes each accepted parameter', () => {
  const spec = describeParams('odd-cycle');
  assert.equal(spec.name, 'odd-cycle');
  assert.equal(spec.family, 'odd-cycle');
  assert.equal(typeof spec.label, 'string');
  assert.equal(spec.params.length, 1);

  const n = spec.params[0];
  assert.equal(n.name, 'n');
  assert.equal(n.type, 'integer');
  assert.equal(n.min, 3);
  assert.equal(n.max, 99);
  assert.equal(n.default, 5);
  assert.equal(typeof n.description, 'string');
  assert.ok(n.description.length > 0);

  for (const name of ['g14', 'magic-square']) {
    const parameterless = describeParams(name);
    assert.equal(parameterless.name, name);
    assert.deepEqual(parameterless.params, []);
  }
});

test('every listed game is resolvable and every param spec is complete', () => {
  for (const name of listGames()) {
    const spec = describeParams(name);
    assert.ok(spec, name + ' must be describable');
    for (const param of spec.params) {
      assert.equal(param.type, 'integer', name + '.' + param.name + ' must be an integer param');
      assert.ok(Number.isSafeInteger(param.min), name + '.' + param.name + '.min');
      assert.ok(Number.isSafeInteger(param.max), name + '.' + param.name + '.max');
      assert.ok(Number.isSafeInteger(param.default), name + '.' + param.name + '.default');
      assert.ok(param.default >= param.min && param.default <= param.max,
        name + '.' + param.name + ': default must be in range');
    }
    const game = getGame(name);
    assert.equal(game.name, name);
    assert.ok(game.id.startsWith(name), 'id must begin with the registry key');
  }
});

/* ------------------------------------------------------------------ *
 * Source scan: no dynamic code construction anywhere under scripts/lib/nlg/
 * ------------------------------------------------------------------ */

test('no eval, no Function constructor and no dynamic require under scripts/lib/nlg/', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const root = path.resolve(__dirname, '..');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(full);
      }
    }
  };
  walk(root);
  assert.ok(files.length >= 5, 'expected to find the library sources under ' + root +
    ', found ' + files.length);

  const EVAL_CALL = /\beval\s*\(/;
  const FUNCTION_CTOR = /\bnew\s+Function\s*\(/;
  const REQUIRE_CALL = /\brequire\s*\(([^)]*)\)/g;
  // A plain single- or double-quoted string literal with no escapes.
  const PLAIN_STRING = /^\s*'[^'\\]*'\s*$|^\s*"[^"\\]*"\s*$/;

  const offences = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const where = rel + ':' + (i + 1) + ' -> ' + line.trim();
      if (EVAL_CALL.test(line)) {
        offences.push('forbidden dynamic evaluation at ' + where);
      }
      if (FUNCTION_CTOR.test(line)) {
        offences.push('forbidden Function constructor at ' + where);
      }
      REQUIRE_CALL.lastIndex = 0;
      let match = REQUIRE_CALL.exec(line);
      while (match !== null) {
        if (!PLAIN_STRING.test(match[1])) {
          offences.push('non-literal module path at ' + where);
        }
        match = REQUIRE_CALL.exec(line);
      }
    }
  }

  assert.deepEqual(offences, [],
    'forbidden dynamic code construction:\n  ' + offences.join('\n  '));
});
