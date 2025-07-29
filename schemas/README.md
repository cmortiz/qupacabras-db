# Benchmark Validation Schema

This directory contains the JSON Schema used to validate quantum benchmark submissions.

## Schema Overview

The `benchmark-schema.json` file defines the structure and validation rules for all benchmark submissions. It ensures data consistency and quality across the project.

## Key Features

### Required Fields
- **id**: Must match the submission folder name
- **algorithmName**: Name of the quantum experiment
- **device**: Quantum device or simulator used
- **metricName**: Performance metric (from predefined list)
- **metricValue**: Numeric result
- **timestamp**: ISO 8601 formatted date

### Quantum-Specific Validation
The schema includes specialized validation for quantum computing properties:
- Qubit count limits (1-1000)
- Gate count validation
- Circuit depth constraints
- Two-qubit gate count must not exceed total gates
- Measurement shot count validation

### Error Rate Statistics
Error rate fields represent **aggregated statistics** across the entire experiment:
- **Qubit Error**: Aggregated across all qubits used in the QASM file execution
- **Readout Error**: Aggregated across all experiments performed
- **2Q Gate Error**: Aggregated across all two-qubit gates used
- **1Q Gate Error**: Aggregated across all single-qubit gates used

These are not individual qubit/gate measurements but statistical summaries of overall performance.

### Metric-Specific Ranges
Different metrics have appropriate value ranges:
- **Fidelity/Success Probability**: 0-1
- **Error Rates**: 0-1
- **Execution Time**: > 0
- **Quantum Volume/CLOPS**: Flexible positive values

### Environment Information
Optional fields for execution environment:
- Quantum cloud providers (IBM, AWS, Azure, Google, etc.)
- Backend/device names
- Simulator types
- Device quantum volume

## Using the Schema

### Programmatic Validation
```javascript
const Ajv = require('ajv');
const schema = require('./benchmark-schema.json');

const ajv = new Ajv();
const validate = ajv.compile(schema);

const valid = validate(benchmarkData);
if (!valid) {
  console.log(validate.errors);
}
```

### Command Line Validation
```bash
# Validate all submissions
npm run validate

# Validate specific file
npm run validate:file path/to/benchmark.json
```

## Extending the Schema

When adding new fields:
1. Update `benchmark-schema.json` with new properties
2. Add appropriate validation rules
3. Update the template file
4. Document changes in CONTRIBUTING.md
5. Test with existing submissions

## Schema Version

Current version: 1.0.0

The schema follows semantic versioning. Breaking changes will increment the major version.
