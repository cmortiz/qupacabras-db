# Qupacabras 🧪

A community-maintained database for tracking the performance of quantum algorithms executed on quantum devices.

## Features

- 📊 **Automatic Data Collection**: Submit benchmarks via pull requests - no manual data entry
- ✅ **Enhanced Validation**: JSON Schema validation with quantum-specific checks
- 🔍 **Duplicate Detection**: Automatic detection of similar submissions
- 🌐 **GitHub Pages Deployment**: Live website updates automatically on merge
- 📈 **Data Export**: Download benchmark data as CSV for analysis
- 🔬 **Quantum-Specific Fields**: Track qubits, gates, circuit depth, and more

## Quick Start

1. Fork this repository
2. Copy the `submissions/template/` folder
3. Fill in your benchmark data
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions.

## Validation

All submissions are automatically validated for:
- ✅ JSON Schema compliance
- ✅ Required field presence and types  
- ✅ Quantum-specific field consistency
- ✅ QASM file existence
- ✅ Duplicate detection
- ✅ Numeric value ranges

Run validation locally:
```bash
npm run validate
```
