# Benchmark Submission Template

This folder contains templates for submitting quantum experiment benchmarks.

## Quick Start - Only 4 Required Fields!

At minimum, you only need these fields in `benchmark.json`:
```json
{
  "algorithmName": "Your Algorithm Name",
  "device": "Quantum Device or Simulator",
  "metricName": "What you measured",
  "metricValue": 0.95
}
```

That's it! The system will auto-generate:
- `id` from your folder name
- `timestamp` with current date/time

## Example Templates

1. **minimal-example.json** - Absolute minimum required (4 fields)
2. **benchmark.json** - Standard submission with common fields
3. **advanced-example.json** - Full example with all optional fields

## How to Submit

1. Copy this `template` folder
2. Rename it (e.g., `my_algorithm_2024`)
3. Edit `benchmark.json` with your data
4. Optionally add `.qasm` files
5. Submit a pull request

## Optional Enhancements

Add these fields to provide more context:
- `description` - What you benchmarked
- `paperUrl` - Link to your paper
- `qasmFiles` - List of circuit files
- `quantumSpecific` - Qubit count, gate count, etc.
- Any custom fields you want!

## Tips

- Start simple - you can always add more fields later
- The schema is flexible - add any extra data you need
- QASM files are optional but recommended