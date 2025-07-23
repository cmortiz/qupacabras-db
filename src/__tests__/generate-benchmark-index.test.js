const fs = require('fs');
const path = require('path');
const generateBenchmarkIndex = require('../../scripts/generate-benchmark-index');

// Mock fs module
jest.mock('fs');

describe('generateBenchmarkIndex', () => {
  const mockSubmissionsDir = '/test/submissions';
  const mockOutputFile = '/test/public/benchmarks.json';
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('processes valid submissions correctly', () => {
    const mockBenchmarkData = {
      id: 'test_benchmark',
      algorithmName: 'Test Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 0.95,
      timestamp: '2024-01-01T10:00:00Z',
      qasmFiles: ['test.qasm']
    };

    const mockQasmContent = `
OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;
    `;

    // Mock directory structure
    fs.readdirSync.mockReturnValue([
      { name: 'test_benchmark', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes('benchmark.json')) return true;
      if (filePath.includes('test.qasm')) return true;
      if (filePath.includes('/public')) return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('benchmark.json')) {
        return JSON.stringify(mockBenchmarkData);
      }
      if (filePath.includes('test.qasm')) {
        return mockQasmContent;
      }
      return '';
    });

    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'test_benchmark',
      algorithmName: 'Test Algorithm',
      benchmarkFolder: 'test_benchmark'
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Test Algorithm')
    );
  });

  test('validates required fields and skips invalid submissions', () => {
    const incompleteData = {
      id: 'incomplete',
      algorithmName: 'Test Algorithm'
      // Missing required fields: device, metricName, metricValue, timestamp
    };

    fs.readdirSync.mockReturnValue([
      { name: 'incomplete', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(incompleteData));
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Missing required fields')
    );
  });

  test('validates QASM files existence and content', () => {
    const dataWithQasm = {
      id: 'test_qasm',
      algorithmName: 'Test Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 0.95,
      timestamp: '2024-01-01T10:00:00Z',
      qasmFiles: ['missing.qasm', 'invalid.qasm']
    };

    fs.readdirSync.mockReturnValue([
      { name: 'test_qasm', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes('benchmark.json')) return true;
      if (filePath.includes('missing.qasm')) return false; // File doesn't exist
      if (filePath.includes('invalid.qasm')) return true;
      if (filePath.includes('/public')) return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('benchmark.json')) {
        return JSON.stringify(dataWithQasm);
      }
      if (filePath.includes('invalid.qasm')) {
        return 'not valid qasm content'; // Missing QASM headers
      }
      return '';
    });

    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(1); // Should still process despite warnings
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('validation warnings')
    );
  });

  test('validates numeric values', () => {
    const dataWithInvalidNumbers = {
      id: 'invalid_numbers',
      algorithmName: 'Test Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 'not a number',
      uncertainty: 'also not a number',
      timestamp: '2024-01-01T10:00:00Z'
    };

    fs.readdirSync.mockReturnValue([
      { name: 'invalid_numbers', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(dataWithInvalidNumbers));
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(1); // Should still process despite warnings
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('metricValue should be numeric')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('uncertainty should be numeric')
    );
  });

  test('validates URL formats', () => {
    const dataWithInvalidUrl = {
      id: 'invalid_url',
      algorithmName: 'Test Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 0.95,
      timestamp: '2024-01-01T10:00:00Z',
      paperUrl: 'not-a-valid-url'
    };

    fs.readdirSync.mockReturnValue([
      { name: 'invalid_url', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(dataWithInvalidUrl));
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('paperUrl should be a valid HTTP/HTTPS URL')
    );
  });

  test('sorts benchmarks by timestamp (newest first)', () => {
    const olderBenchmark = {
      id: 'older',
      algorithmName: 'Older Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 0.8,
      timestamp: '2024-01-01T10:00:00Z'
    };

    const newerBenchmark = {
      id: 'newer',
      algorithmName: 'Newer Algorithm',
      device: 'Test Device',
      metricName: 'Test Metric',
      metricValue: 0.9,
      timestamp: '2024-01-02T10:00:00Z'
    };

    fs.readdirSync.mockReturnValue([
      { name: 'older', isDirectory: () => true },
      { name: 'newer', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('older/benchmark.json')) {
        return JSON.stringify(olderBenchmark);
      }
      if (filePath.includes('newer/benchmark.json')) {
        return JSON.stringify(newerBenchmark);
      }
      return '';
    });

    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('newer'); // Newer benchmark should be first
    expect(result[1].id).toBe('older');
  });

  test('handles JSON parsing errors gracefully', () => {
    fs.readdirSync.mockReturnValue([
      { name: 'corrupt', isDirectory: () => true },
      { name: 'template', isDirectory: () => true }
    ]);

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{ invalid json }');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    const result = generateBenchmarkIndex();

    expect(result).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error processing corrupt/benchmark.json:'),
      expect.any(String)
    );
  });
});