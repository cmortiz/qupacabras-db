# Shor's Algorithm - Factoring 15

This submission contains the implementation and benchmark results for Shor's algorithm factoring the number 15.

## Algorithm Overview

Shor's algorithm is a quantum algorithm for integer factorization that runs in polynomial time on a quantum computer. This implementation targets factoring 15 = 3 × 5.

## Implementation Details

- **Quantum Device**: IonQ Harmony
- **Qubits Used**: 7 qubits
- **Circuit Depth**: 142 gates
- **Error Mitigation**: Zero-noise extrapolation

## Results

- **Success Probability**: 99%
- **Uncertainty**: ±1%
- **Measurement Shots**: 10,000
- **Correct Factorization Rate**: 99%

## Files

- `shor_15_factoring.qasm` - Main quantum circuit implementation
- `benchmark.json` - Benchmark metadata

## References

- Original paper: https://arxiv.org/abs/quant-ph/9508027
- Implementation based on the quantum period finding subroutine