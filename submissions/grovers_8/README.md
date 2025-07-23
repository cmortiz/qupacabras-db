# Grover's Algorithm - 8-Item Database Search

Implementation of Grover's quantum search algorithm for finding a marked item in an 8-item database.

## Algorithm Overview

Grover's algorithm provides a quadratic speedup for searching unsorted databases. For 8 items, the optimal number of iterations is 2.

## Implementation Details

- **Quantum Device**: Rigetti Aspen-M-2  
- **Qubits Used**: 3 qubits
- **Database Size**: 8 items
- **Marked Item**: Position 5 (binary: 101)
- **Iterations**: 2 Grover iterations

## Results

- **Success Rate**: 95%
- **Uncertainty**: ±2%
- **Measurement Shots**: 5,000
- **Theoretical Optimum**: 96.9%

## Files

- `grover_search.qasm` - Main Grover algorithm circuit
- `oracle.qasm` - Oracle implementation for marking item 5

## References

- Original paper: https://arxiv.org/abs/quant-ph/9605043