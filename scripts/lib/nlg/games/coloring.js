/**
 * Generic graph-coloring nonlocal game.
 *
 * The referee holds an undirected graph on vertices 0..V-1 and a color count c.
 * It draws a question pair (x, y) uniformly from:
 *
 *   - the V "same vertex" pairs (v, v), and
 *   - every edge {u, v} in BOTH directions, so (u, v) and (v, u).
 *
 * That is V + 2E questions. The both-directions convention is load bearing: an
 * implementation that emits each edge once instead changes the question
 * distribution and therefore silently shifts the classical bound. The odd cycle
 * game in this directory uses the opposite (each edge once) convention on
 * purpose. See games/README.md.
 *
 * Win condition:
 *
 *   x === y  ->  win iff a === b   (the players agree on the color of a vertex)
 *   x !== y  ->  win iff a !== b   (adjacent vertices get different colors)
 *
 * Answers are integers in 0..c-1. Each player answers with
 * `ceil(log2(c))` bits (at least 1), which is the fixed answer width the counts
 * encoding pads to. An answer that is not an integer in 0..c-1 is out of range
 * and LOSES; it is never an exception, because answers come from submitted
 * measurement data and a malformed answer key must cost the submitter a win
 * rather than crash the verifier.
 *
 * Classical value:
 *
 *   (V + 2 * maxProperEdges) / (V + 2E)
 *
 * where `maxProperEdges` is the largest number of edges properly colored by any
 * c-coloring of the graph. Computing `maxProperEdges` for a general graph is
 * NP-hard (it is MAX-c-CUT), so this module does NOT compute it. The caller
 * supplies `classicalValue` as a documented, separately verified constant, and
 * this module checks only that it is a finite number in (0, 1]. The derivation
 * of the formula: a deterministic strategy pair wins every (v, v) question when
 * both players use the same coloring, and wins an edge question exactly when
 * the two endpoints differ, so the best deterministic pair scores
 * V + 2 * maxProperEdges out of V + 2E. `games/__tests__` proves the formula by
 * exhaustive search on small instances.
 */

/**
 * Fixed answer width in bits for a `colors`-color game.
 *
 * Computed with shifts rather than `Math.log2` so no floating point rounding
 * can move a boundary: 4 colors is exactly 2 bits, never 3.
 *
 * @param {number} colors
 * @returns {number} bit width, at least 1
 */
function colorAnswerBits(colors) {
  let bits = 0;
  while ((1 << bits) < colors) {
    bits += 1;
  }
  return bits === 0 ? 1 : bits;
}

function badGameDef(message) {
  const error = new Error(message);
  error.code = 'BAD_GAME_DEF';
  return error;
}

function assertVertex(value, vertexCount, context) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) {
    throw badGameDef(
      context + ': vertex must be an integer in 0..' + (vertexCount - 1) + ', got ' + String(value)
    );
  }
}

/**
 * Build a coloring game definition.
 *
 * @param {object} spec
 * @param {string} spec.id           canonical registry id, e.g. "g14"
 * @param {string} spec.name         registry key
 * @param {object} spec.params       resolved integer params (may be empty)
 * @param {string} spec.family       family name, "coloring"
 * @param {string} spec.label        short human readable name
 * @param {number} spec.vertexCount  V, number of vertices (vertices are 0..V-1)
 * @param {Array<Array<number>>} spec.edges  undirected edge list, each [u, v], each edge listed once
 * @param {number} spec.colors       c, number of colors
 * @param {number} spec.classicalValue  supplied, separately verified constant
 * @param {number|null} spec.quantumValue  supplied, or null when not pinned to a source
 * @param {object} [spec.reference]  optional {citation, url}
 * @returns {object} NonlocalGameDef (not frozen; the registry freezes it)
 */
function createColoringGame(spec) {
  const vertexCount = spec.vertexCount;
  const colors = spec.colors;
  const edges = spec.edges;

  if (!Number.isSafeInteger(vertexCount) || vertexCount < 1) {
    throw badGameDef('vertexCount must be a positive integer, got ' + String(vertexCount));
  }
  if (!Number.isSafeInteger(colors) || colors < 2) {
    throw badGameDef('colors must be an integer >= 2, got ' + String(colors));
  }
  if (!Array.isArray(edges)) {
    throw badGameDef('edges must be an array of [u, v] pairs');
  }

  const seen = new Set();
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw badGameDef('edges[' + i + '] must be a two element array');
    }
    assertVertex(edge[0], vertexCount, 'edges[' + i + '][0]');
    assertVertex(edge[1], vertexCount, 'edges[' + i + '][1]');
    if (edge[0] === edge[1]) {
      throw badGameDef('edges[' + i + '] is a self loop on vertex ' + edge[0]);
    }
    const lo = Math.min(edge[0], edge[1]);
    const hi = Math.max(edge[0], edge[1]);
    const tag = lo + '-' + hi;
    if (seen.has(tag)) {
      throw badGameDef('edges[' + i + '] repeats the undirected edge {' + lo + ', ' + hi + '}');
    }
    seen.add(tag);
  }

  if (typeof spec.classicalValue !== 'number' || !Number.isFinite(spec.classicalValue) ||
      spec.classicalValue <= 0 || spec.classicalValue > 1) {
    throw badGameDef('classicalValue must be a finite number in (0, 1], got ' + String(spec.classicalValue));
  }
  if (spec.quantumValue !== null &&
      (typeof spec.quantumValue !== 'number' || !Number.isFinite(spec.quantumValue) ||
       spec.quantumValue <= 0 || spec.quantumValue > 1)) {
    throw badGameDef('quantumValue must be null or a finite number in (0, 1], got ' + String(spec.quantumValue));
  }

  const questionCount = vertexCount + 2 * edges.length;
  const weight = 1 / questionCount;
  const questions = [];
  for (let v = 0; v < vertexCount; v += 1) {
    questions.push({ key: v + '|' + v, x: v, y: v, weight: weight });
  }
  for (let i = 0; i < edges.length; i += 1) {
    const u = edges[i][0];
    const v = edges[i][1];
    questions.push({ key: u + '|' + v, x: u, y: v, weight: weight });
    questions.push({ key: v + '|' + u, x: v, y: u, weight: weight });
  }

  function inRange(answer) {
    return Number.isInteger(answer) && answer >= 0 && answer < colors;
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

  const bits = colorAnswerBits(colors);

  const def = {
    id: spec.id,
    name: spec.name,
    params: spec.params,
    family: spec.family,
    label: spec.label,
    aliceAnswerBits: bits,
    bobAnswerBits: bits,
    questions: questions,
    isWin: isWin,
    classicalValue: spec.classicalValue,
    quantumValue: spec.quantumValue
  };
  if (spec.reference) {
    def.reference = spec.reference;
  }
  return def;
}

module.exports = {
  createColoringGame: createColoringGame,
  colorAnswerBits: colorAnswerBits
};
