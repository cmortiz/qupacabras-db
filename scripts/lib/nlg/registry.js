/**
 * Nonlocal game registry.
 *
 * A submission names a game with a plain string and supplies a plain object of
 * INTEGER parameters. Both come from an untrusted pull request, so the two
 * things this module must never do are resolve a name to something inherited
 * from `Object.prototype` and accept a parameter it has not bounds checked.
 *
 * Public interface:
 *
 *   listGames()                -> string[]
 *   getGame(name, params)      -> NonlocalGameDef, deeply frozen and cached
 *   describeParams(name)       -> spec object, or null for an unknown name
 *
 * `getGame` throws an Error carrying `.code === 'UNKNOWN_GAME'` or
 * `.code === 'BAD_PARAM'`. `describeParams` never throws; it returns null.
 *
 * NonlocalGameDef:
 *
 *   {
 *     id,                    canonical string, e.g. "odd-cycle:n=5", stable for
 *                            duplicate detection
 *     name,                  registry key
 *     params,                resolved integer params, frozen
 *     family,                "coloring" | "odd-cycle" | "magic-square"
 *     label,                 short human readable name
 *     aliceAnswerBits,       fixed answer widths in bits
 *     bobAnswerBits,
 *     questions,             [{ key: "<x>|<y>", x, y, weight }], frozen
 *     isWin(q, a, b),        boolean
 *     classicalValue,
 *     quantumValue,          number in (0, 1], or null when not pinned to a
 *                            source (the superquantum check then degrades to
 *                            "not above 1")
 *     reference?             { citation, url }
 *   }
 *
 * Adding a game: see games/README.md.
 */

const g14 = require('./games/g14');
const magicSquare = require('./games/magic-square');
const oddCycle = require('./games/odd-cycle');

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Dispatch table with a NULL PROTOTYPE.
 *
 * A submission supplying "__proto__", "constructor", "toString" or any other
 * inherited name as a game name finds nothing to resolve to, because this
 * object inherits nothing. Every lookup is additionally guarded with an own
 * property check, so even swapping this for a plain object would not open the
 * hole. Both belts are deliberate.
 */
const GAMES = Object.create(null);
GAMES['g14'] = g14;
GAMES['magic-square'] = magicSquare;
GAMES['odd-cycle'] = oddCycle;

const GAME_NAMES = Object.keys(GAMES).sort();

/** id -> frozen NonlocalGameDef. Keyed on the canonical id, so repeated calls with equivalent params share a reference. */
const cache = new Map();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Render an untrusted value for an error message without ever invoking user
 * supplied code: no String() on a symbol, no toString() on an object.
 */
function describeValue(value) {
  const kind = typeof value;
  if (kind === 'string') {
    return JSON.stringify(value);
  }
  if (kind === 'symbol') {
    return 'a symbol';
  }
  if (kind === 'bigint') {
    return value.toString() + 'n';
  }
  if (kind === 'function') {
    return 'a function';
  }
  if (value === null) {
    return 'null';
  }
  if (kind === 'object') {
    return Array.isArray(value) ? 'an array' : 'an object';
  }
  return String(value);
}

function lookup(name) {
  if (typeof name !== 'string' || !hasOwn.call(GAMES, name)) {
    throw fail('UNKNOWN_GAME', 'unknown nonlocal game ' + describeValue(name) +
      '; known games: ' + GAME_NAMES.join(', '));
  }
  return GAMES[name];
}

/**
 * Validate and default the submitted params against a game's param specs.
 *
 * Every accepted value is a safe integer inside the declared [min, max], plus
 * any per-spec constraint (currently only `odd`). `Number.isSafeInteger`
 * rejects NaN, Infinity and non-integers in one step, and the `typeof` guard in
 * front of it rejects numeric strings, so "5" is a BAD_PARAM rather than a
 * silently coerced 5.
 *
 * @returns {object} plain object with exactly the declared param names
 */
function resolveParams(name, specs, supplied) {
  const source = (supplied === undefined || supplied === null) ? {} : supplied;
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw fail('BAD_PARAM', 'game "' + name + '": params must be a plain object, got ' +
      describeValue(supplied));
  }

  const declared = Object.create(null);
  for (let i = 0; i < specs.length; i += 1) {
    declared[specs[i].name] = specs[i];
  }

  const accepted = specs.length === 0 ? '(none)' : specs.map(specName).join(', ');
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    if (!hasOwn.call(declared, keys[i])) {
      throw fail('BAD_PARAM', 'game "' + name + '": unknown parameter ' + describeValue(keys[i]) +
        '; accepted parameters: ' + accepted);
    }
  }

  const resolved = {};
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const value = hasOwn.call(source, spec.name) ? source[spec.name] : spec.default;

    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw fail('BAD_PARAM', 'game "' + name + '": parameter "' + spec.name +
        '" must be a safe integer, got ' + describeValue(value));
    }
    if (value < spec.min || value > spec.max) {
      throw fail('BAD_PARAM', 'game "' + name + '": parameter "' + spec.name + '" must be in ' +
        spec.min + '..' + spec.max + ', got ' + value);
    }
    if (spec.odd === true && (value % 2) === 0) {
      throw fail('BAD_PARAM', 'game "' + name + '": parameter "' + spec.name +
        '" must be odd, got ' + value);
    }
    resolved[spec.name] = value;
  }
  return resolved;
}

function specName(spec) {
  return spec.name;
}

/**
 * Canonical id: the registry key, then the declared params in DECLARATION
 * order, so the id does not depend on the key order of the submitted object.
 * A game with no params has the bare name as its id.
 */
function canonicalId(name, specs, resolved) {
  if (specs.length === 0) {
    return name;
  }
  const parts = [];
  for (let i = 0; i < specs.length; i += 1) {
    parts.push(specs[i].name + '=' + resolved[specs[i].name]);
  }
  return name + ':' + parts.join(',');
}

function freezeGame(def) {
  Object.freeze(def.params);
  for (let i = 0; i < def.questions.length; i += 1) {
    Object.freeze(def.questions[i]);
  }
  Object.freeze(def.questions);
  if (def.reference) {
    Object.freeze(def.reference);
  }
  return Object.freeze(def);
}

/**
 * Names of every registered game, sorted. A fresh array each call, so a caller
 * cannot mutate the registry's own list.
 *
 * @returns {string[]}
 */
function listGames() {
  return GAME_NAMES.slice();
}

/**
 * Resolve a game name and parameter set to a deeply frozen definition.
 *
 * Cached on the canonical id, so two calls with equivalent params return the
 * identical reference.
 *
 * @param {string} name
 * @param {object} [params]
 * @returns {object} NonlocalGameDef
 * @throws {Error} with `.code` 'UNKNOWN_GAME' or 'BAD_PARAM'
 */
function getGame(name, params) {
  const mod = lookup(name);
  const resolved = resolveParams(mod.name, mod.params, params);
  const id = canonicalId(mod.name, mod.params, resolved);

  const cached = cache.get(id);
  if (cached !== undefined) {
    return cached;
  }

  const def = mod.build(id, resolved);
  // Author error guard: a game module that disagrees with its own registration
  // would produce ids that do not round trip through duplicate detection.
  if (def.id !== id || def.name !== mod.name || def.family !== mod.family) {
    throw new Error('game module "' + mod.name + '" returned an inconsistent definition');
  }

  const frozen = freezeGame(def);
  cache.set(id, frozen);
  return frozen;
}

/**
 * Describe a game's accepted parameters.
 *
 * Returns null for an unknown name; it does not throw. Only `getGame` throws.
 *
 * @param {string} name
 * @returns {object|null} { name, family, label, params: [{name, type, min, max, default, description}] }
 */
function describeParams(name) {
  if (typeof name !== 'string' || !hasOwn.call(GAMES, name)) {
    return null;
  }
  const mod = GAMES[name];
  return Object.freeze({
    name: mod.name,
    family: mod.family,
    label: mod.label,
    params: mod.params
  });
}

module.exports = {
  listGames: listGames,
  getGame: getGame,
  describeParams: describeParams
};
