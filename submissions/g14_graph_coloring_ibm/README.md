# G14 Graph Coloring Nonlocal Game Experiment

This submission contains quantum circuits for G14 graph coloring nonlocal game experiments on IBM quantum devices.

## Experiment Details

- **Paper**: [Quantum advantage and non-locality in Bell tests](https://arxiv.org/pdf/2311.01363)
- **Total Circuits**: 88 different configurations
- **Qubits**: 4 qubits per circuit
- **Purpose**: Test quantum strategies for graph coloring game on a 14-vertex graph (G14)

## Circuit Structure

Each circuit implements a strategy for the G14 graph coloring game using Bell pairs, followed by specific rotations and measurements designed to maximize the winning probability.

### Gate Composition (per circuit):
- 2 Hadamard gates (state preparation)
- 3 CNOT gates (entanglement)
- 4 U gates (single-qubit rotations)
- 4 Ry gates (Y-axis rotations)
- 4 Measurements

## Results

The experiments achieved approximately 85% win rate on IBM quantum devices for the G14 graph coloring problem.

## Source

Original QASM files available at: https://github.com/jfurches/nonlocalgames/tree/main/circuits/bell_pair