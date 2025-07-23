// Grover's Algorithm for 8-item search
// Searches for item at position 5 (binary: 101)
OPENQASM 2.0;
include "qelib1.inc";

qreg q[3];
creg c[3];

// Initialize superposition
h q[0];
h q[1];
h q[2];

// Grover iteration 1
// Apply oracle (marks item 5)
x q[0];
x q[2];
ccx q[0], q[1], q[2];
x q[0];
x q[2];

// Diffusion operator
h q[0];
h q[1];
h q[2];
x q[0];
x q[1];
x q[2];
ccx q[0], q[1], q[2];
x q[0];
x q[1];
x q[2];
h q[0];
h q[1];
h q[2];

// Grover iteration 2
// Apply oracle again
x q[0];
x q[2];
ccx q[0], q[1], q[2];
x q[0];
x q[2];

// Diffusion operator
h q[0];
h q[1];
h q[2];
x q[0];
x q[1];
x q[2];
ccx q[0], q[1], q[2];
x q[0];
x q[1];
x q[2];
h q[0];
h q[1];
h q[2];

// Measurement
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];