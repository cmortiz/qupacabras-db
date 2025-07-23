// Oracle for Grover's Algorithm
// Marks database item at position 5 (binary: 101)
OPENQASM 2.0;
include "qelib1.inc";

qreg q[3];

// Oracle implementation
// Flips phase of |101⟩ state
x q[1];  // NOT on middle qubit
ccz q[0], q[1], q[2];  // Controlled-controlled-Z
x q[1];  // NOT on middle qubit