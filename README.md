# Qupacabras-DB

A community-maintained database for tracking the performance of quantum experiments executed on quantum devices.

## Features

- 📊 **Automatic Data Collection**: Submit benchmarks via pull requests - no manual data entry
- ✅ **Enhanced Validation**: JSON Schema validation with quantum-specific checks
- 🌐 **GitHub Pages Deployment**: Live checks and website updates automatically on merge
- 📈 **Data Export**: Download benchmark data as CSV for analysis
- 🔬 **Quantum-Specific Metrics**: Track qubits, gates, circuit depth, and more

## 🚀 Submit a Benchmark

**The easiest way to contribute is via our web form - no coding required!**

1. **[Click here to submit a benchmark](https://github.com/cmortiz/qupacabras-db/issues/new?template=benchmark_submission.yml)**
2. Fill out the form
3. Click Submit

Our bot will automatically create a Pull Request for you! 🤖

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
