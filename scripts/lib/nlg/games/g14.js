const { createColoringGame } = require('./coloring');

/**
 * G14: the 14 vertex graph coloring game used by the published corpus.
 *
 * 14 vertices, 37 undirected edges, 4 colors, so
 * 14 + 2 * 37 = 88 questions and 2 answer bits per player.
 *
 * The edge list below is transcribed verbatim, in file order, from
 * `nlg_data_extracted/data/games/g14/g14.nx` (37 lines of `<u> <v> {}`). That
 * directory is vendored data, not a dependency of this library, so the list is
 * a literal here and nothing is read at runtime. Any change to the graph must
 * be a deliberate edit to this file, which is the point: the graph determines
 * the classical bound.
 */
const EDGES = [
  [0, 1], [0, 2], [0, 4], [0, 3], [0, 13],
  [1, 2], [1, 5], [1, 6], [1, 13],
  [2, 7], [2, 8], [2, 13],
  [4, 3], [4, 12], [4, 9], [4, 13],
  [3, 10], [3, 11], [3, 13],
  [5, 6], [5, 11], [5, 12], [5, 13],
  [6, 9], [6, 10], [6, 13],
  [7, 8], [7, 10], [7, 12], [7, 13],
  [8, 9], [8, 11], [8, 13],
  [10, 13], [11, 13], [12, 13], [9, 13]
];

const VERTEX_COUNT = 14;
const COLORS = 4;

/**
 * Classical value 43/44 = 0.9772727272727273.
 *
 * Verified two ways. (1) `nlg_data_extracted/data/db.json`, the G14 game record,
 * stores `optimal_classical_value: 0.9772727272727273`. (2) Exhaustive search
 * over all 4^13 colorings (vertex 0 fixed by color symmetry) finds a maximum of
 * 36 of the 37 edges properly colored, and the coloring game formula
 * (V + 2 * maxProperEdges) / (V + 2E) gives (14 + 72) / 88 = 86/88 = 43/44.
 * That search is too slow for a unit test, so `__tests__/games.test.js` asserts
 * the structure exhaustively and proves the formula itself by brute force on
 * small instances.
 */
const CLASSICAL_VALUE = 43 / 44;

/**
 * Quantum value 1, quoted from `nlg_data_extracted/data/db.json`, which stores
 * `optimal_quantum_value: 1` for this game. Not derived here and not written
 * from memory. A quantum value of exactly 1 makes the Wave 2 superquantum check
 * degrade to "a win rate above 1 is impossible".
 */
const QUANTUM_VALUE = 1;

/**
 * Quoted exactly from `nlg_data_extracted/data/db.json`, games record "1",
 * `publication`. Not written from memory.
 */
const REFERENCE = {
  citation: 'L. Mančinska and D. E. Roberson, Baltic Journal on Modern Computing, 4(4), 846-859, 2016',
  url: 'https://arxiv.org/abs/1801.03542'
};

module.exports = {
  name: 'g14',
  family: 'coloring',
  label: 'G14 graph coloring',
  params: Object.freeze([]),
  build: function build(id, params) {
    return createColoringGame({
      id: id,
      name: 'g14',
      params: params,
      family: 'coloring',
      label: 'G14 graph coloring',
      vertexCount: VERTEX_COUNT,
      edges: EDGES,
      colors: COLORS,
      classicalValue: CLASSICAL_VALUE,
      quantumValue: QUANTUM_VALUE,
      reference: REFERENCE
    });
  }
};
