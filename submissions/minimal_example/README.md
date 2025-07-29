# Benchmark Template

This template shows how to structure your quantum experiment benchmark submission.

## Required Files

1. **`benchmark.json`** - Contains all benchmark metadata
2. **`README.md`** - Detailed description and methodology  
3. **`*.qasm`** - QASM circuit files
4. **Supporting files** (optional) - Analysis scripts, raw data, etc.

## Instructions

1. Copy this template folder to `submissions/your_algorithm_name/`
2. Update `benchmark.json` with your data
3. Replace this README with your description
4. Add your QASM files
5. Submit a Pull Request

## Example Structure

```
submissions/
├── your_algorithm_name/
│   ├── benchmark.json          # Metadata
│   ├── README.md              # Documentation
│   ├── circuit.qasm           # Main circuit
│   ├── measurement.qasm       # Measurement circuit (if separate)
│   ├── analysis.py            # Analysis script (optional)
│   └── raw_data.csv          # Raw results (optional)
```

## benchmark.json Fields

- **id**: Unique identifier (use folder name)
- **algorithmName**: Name of the quantum experiment
- **team**: Array of contributor names
- **device**: Quantum device or simulator used
- **metricName**: Performance metric measured
- **metricValue**: Numerical result
- **uncertainty**: Statistical uncertainty (optional)
- **paperUrl**: Link to published paper (optional)
- **timestamp**: When benchmark was performed (ISO 8601)
- **qasmFiles**: List of QASM files in this folder
- **description**: Brief description
- **methodology**: How the benchmark was performed
- **notes**: Additional notes or caveats