# Contributing to Qupacabras-DB

Thank you for contributing to the Qupacabras-DB quantum algorithm benchmark database!

## 🚀 Super Quick Start (2 minutes!)

### Minimal Submission - Only 4 fields required!

1. **Fork** this repository
2. **Copy** `submissions/template/` → `submissions/your_name/`
3. **Edit** `benchmark.json` with just:
```json
{
  "algorithmName": "Grover's Algorithm",
  "device": "IBM Sherbrooke",
  "metricName": "Success Rate",
  "metricValue": 0.95
}
```
4. **Submit PR** - That's it! 🎉

The system auto-generates:
- `id` from your folder name
- `timestamp` with current date
- `contributor` from your GitHub username (when submitting via PR)

## 📊 Adding More Details (Optional)

### Standard Submission
Add these commonly used fields:
- `description` - Brief explanation of your benchmark
- `paperUrl` - Link to your paper/preprint
- `qasmFiles` - List your circuit files: `["circuit.qasm"]` (quantum properties auto-extracted!)
- `quantumSpecific.qubitCount` - Number of qubits used
- `quantumSpecific.shots` - Number of measurement repetitions

### Advanced Submission
See `submissions/template/advanced-example.json` for all possible fields including error rates, execution times, team info, and custom metrics.

```json
{
  "id": "your_algorithm_name",
  "algorithmName": "Your Algorithm Name",
  "team": ["Author 1", "Author 2"],
  "device": "Quantum Device Name",
  "metricName": "Performance Metric",
  "metricValue": 0.85,
  "uncertainty": 0.05,
  "paperUrl": "https://arxiv.org/abs/your-paper",
  "timestamp": "2024-MM-DDTHH:MM:SSZ",
  "qasmFiles": ["circuit1.qasm", "circuit2.qasm"],
  "description": "Brief description of your benchmark",
  "methodology": "How the benchmark was performed",
  "notes": "Any additional notes"
}
```

### Step 3: Submit Pull Request

1. Commit all changes with a clear message
2. Push to your fork
3. Create a Pull Request with:
   - Clear title describing the algorithm
   - Description of the benchmark results
   - Any special notes about the implementation

## Data Format Guidelines

### Required Fields
- `id`: Unique identifier (use folder name)
- `algorithmName`: Name of the quantum algorithm
- `device`: Quantum device or simulator used
- `metricName`: What performance metric was measured (see accepted values below)
- `metricValue`: Numerical result (0-1 for probabilities/fidelities)
- `timestamp`: ISO 8601 format date

### Optional Fields
- `team`: Array of contributor names
- `uncertainty`: Statistical uncertainty (±)
- `paperUrl`: Link to published paper
- `contributor`: GitHub username of the contributor
- `qasmFiles`: Array of QASM circuit file names
- `description`: Brief description of the benchmark
- `methodology`: How the benchmark was performed
- `notes`: Additional notes or caveats

### Quantum-Specific Fields (Recommended)
Add these under the `quantumSpecific` object:
- `qubitCount`: Number of qubits (1-1000)
- `gateCount`: Total quantum gates (0-1000000)
- `circuitDepth`: Circuit depth (0-100000)
- `twoQubitGateCount`: Number of two-qubit gates
- `measurementCount`: Number of shots/repetitions
- `optimizationLevel`: Transpiler optimization level (0-3)
- `errorMitigation`: Error mitigation technique used

### Environment Details (Optional)
Add these under the `environment` object:
- `provider`: Quantum cloud provider (IBM Quantum, AWS Braket, etc.)
- `backend`: Specific device/backend name
- `simulatorType`: Type of simulator if applicable
- `quantumVolume`: Quantum volume of the device

### Accepted Metric Names
- `Fidelity`
- `Success Probability`
- `Win Rate`
- `Custom`

### Error Rate Statistics (Optional)
If you have error rate data, add these under the `errorRates` object with min/max/median/mean for each:

- **`qubit`**: Statistical error rates aggregated across **all qubits** used in the execution of the QASM files. This represents the overall qubit performance during the experiment.
  
- **`readout`**: Statistical readout/measurement error rates aggregated across **all experiments performed**. This captures the accuracy of qubit state measurement.
  
- **`twoQubitGate`**: Statistical error rates for two-qubit basis gates aggregated across **all 2Q gates used** in the circuit execution.
  
- **`singleQubitGate`**: Statistical error rates for single-qubit basis gates aggregated across **all 1Q gates used** in the circuit execution.

**Important**: These statistics should represent the aggregated performance across your entire experiment, not individual qubit or gate measurements.

**Note**: These fields are completely optional. If you don't have error rate data, simply omit the `errorRates` object.

Example:
```json
"errorRates": {
  "qubit": {
    "min": 0.001,      // Minimum error rate across all qubits
    "max": 0.005,      // Maximum error rate across all qubits
    "median": 0.003,   // Median error rate across all qubits
    "mean": 0.0032     // Mean error rate across all qubits
  },
  "readout": {
    "min": 0.01,       // Minimum readout error across all measurements
    "max": 0.03,       // Maximum readout error across all measurements
    "median": 0.02,    // Median readout error across all measurements
    "mean": 0.021      // Mean readout error across all measurements
  }
  // You can include any combination of error types
}
```

### Execution Time Statistics (Optional)
If you have timing data, add under `executionTime` object:
```json
"executionTime": {
  "min": 0.5,      // Minimum execution time across all experiments
  "max": 2.5,      // Maximum execution time across all experiments
  "median": 1.2,   // Median execution time across all experiments
  "mean": 1.3,     // Mean execution time across all experiments
  "unit": "seconds"  // Options: nanoseconds, microseconds, milliseconds, seconds
}
```

**Important**: Execution time should include the total time for **all experiments sent to the quantum computer**, including queueing and processing time.

**Note**: The execution time field is optional. The table will show "N/A" for any missing error rate or timing data.

## Example Submission Structure

```
submissions/
├── grovers_search_16/
│   ├── benchmark.json        # Metadata
│   ├── README.md            # Documentation
│   ├── search_circuit.qasm  # Main circuit
│   ├── oracle.qasm          # Oracle circuit
│   ├── analysis.py          # Analysis script
│   └── results.csv          # Raw data
```

## Benefits of Automatic System

✅ **No manual editing** - just add your submission folder  
✅ **Automatic data loading** - your benchmark appears immediately after merge  
✅ **Single location** for all benchmark files  
✅ **No file duplication** between folders  
✅ **Easier maintenance** for contributors  
✅ **Better organization** with structured metadata  
✅ **Flexible file types** (QASM, analysis, data, etc.)  

## How It Works

1. **Build Process**: GitHub Actions automatically scans `submissions/` folder
2. **Data Generation**: Creates `public/benchmarks.json` from all `benchmark.json` files
3. **Automatic Loading**: Website loads data dynamically from the generated file
4. **Validation**: Script validates required fields and warns about issues

## Review Process

1. Automated checks verify the data format
2. Manual review ensures scientific accuracy
3. Approved submissions are merged and deployed automatically
4. **Your data appears on the website immediately** after merge!

## Validation Tools

### Pre-Commit Validation
The project uses automatic pre-commit validation. When you commit changes to benchmark files, they will be automatically validated.

### Manual Validation
You can validate your submission before committing:

```bash
# Validate all submissions
npm run validate

# Validate a specific file
npm run validate:file submissions/your_algorithm/benchmark.json
```

### Validation Checks
The validation system checks for:
- ✅ JSON Schema compliance
- ✅ Required field presence and types
- ✅ ID matches folder name
- ✅ Valid timestamp format (ISO 8601)
- ✅ Numeric values in correct ranges
- ✅ QASM files exist (if specified)
- ✅ Valid URL formats
- ✅ Quantum-specific field consistency
- ✅ Duplicate submission detection

### Common Validation Errors
1. **ID mismatch**: The `id` field must exactly match your folder name
2. **Invalid metric value**: Fidelity and probability values must be between 0 and 1
3. **Missing QASM files**: All files listed in `qasmFiles` must exist in your folder
4. **Invalid timestamp**: Use ISO 8601 format: `2024-01-15T10:30:00Z`

## Questions?

Open an issue or reach out to the maintainers for help!