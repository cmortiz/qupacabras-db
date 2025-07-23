# Contributing to Qupacabras

Thank you for contributing to the Qupacabras quantum algorithm benchmark database! This guide will help you add your quantum algorithm performance results.

## Quick Start

1. **Fork** this repository
2. **Copy the template** from `submissions/template/`
3. **Fill in your data** in `benchmark.json` and `README.md`
4. **Add your QASM files** to your submission folder
5. **Submit a Pull Request**

✨ **That's it!** Your data will automatically appear on the website once your PR is merged - no manual editing required!

## Adding a New Benchmark

### Step 1: Create Your Submission Folder

1. Copy the `submissions/template/` folder
2. Rename it to `submissions/your_algorithm_name/`
3. Your folder should contain:
   - `benchmark.json` - All your benchmark metadata
   - `README.md` - Detailed description
   - `*.qasm` - Your QASM circuit files
   - Any additional files (analysis scripts, raw data, etc.)

### Step 2: Fill in Your Data

Edit `benchmark.json` with your benchmark information:

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
- `team`: Array of contributor names
- `device`: Quantum device or simulator used
- `metricName`: What performance metric was measured
- `metricValue`: Numerical result (0-1 for probabilities/fidelities)
- `timestamp`: ISO 8601 format date
- `benchmarkFolder`: Name of folder in `submissions/`

### Optional Fields
- `uncertainty`: Statistical uncertainty (±)
- `paperUrl`: Link to published paper

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

## Questions?

Open an issue or reach out to the maintainers for help!