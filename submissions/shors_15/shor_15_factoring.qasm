// Shor's Algorithm for Factoring 15
// Implementation of quantum period finding
OPENQASM 2.0;
include "qelib1.inc";

// Register for period finding
qreg q[7];
creg c[7];

// Initialize superposition in counting register
h q[0];
h q[1];
h q[2];

// Controlled modular exponentiation
// This is a simplified representation of the controlled-U operations
cx q[0], q[3];
cx q[1], q[4];
cx q[2], q[5];

// Quantum Fourier Transform (inverse)
// Simplified QFT implementation
h q[2];
cu1(pi/2) q[1], q[2];
h q[1];
cu1(pi/4) q[0], q[2];
cu1(pi/2) q[0], q[1];
h q[0];

// Measurement
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
measure q[3] -> c[3];
measure q[4] -> c[4];
measure q[5] -> c[5];
measure q[6] -> c[6];