import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BenchmarkTable from '../BenchmarkTable';

const mockBenchmarks = [
  {
    id: 'test1',
    algorithmName: 'Test Algorithm',
    device: 'Test Device',
    metricName: 'Test Metric',
    metricValue: 0.95,
    uncertainty: 0.02,
    paperUrl: 'https://example.com/paper',
    contributor: 'testuser',
    timestamp: new Date('2024-01-01'),
    benchmarkFolder: 'test1',
    generalMetrics: {
      lambda1: 1.25,
      lambda1Source: 'qasm',
      circuitDepth: 12,
      gateFidelity: { oneQubit: 0.999, twoQubit: 0.98, measurementMethod: 'RB' },
      readoutFidelity: 0.979,
      qubitFidelity: 0.9968,
      timing: { circuitDuration: 12, t1: 120, t2: 80, unit: 'us' },
      runtimeOverT1: 0.1,
      runtimeOverT2: 0.15,
      qubitTimeVolume: 48,
      qubitTimeVolumeNormalized: 0.6
    },
    problemSpecific: {
      description: 'Problem-specific description',
      primaryMetric: { name: 'Test Metric', definition: 'Winning fraction', value: 0.95, uncertainty: 0.02, uncertaintyDefinition: '95% CI' },
      qubitRange: { min: 4, max: 4 },
      depthRange: { min: 10, max: 12 },
      shots: 1024,
      methodology: 'Method text',
      notes: 'Notes text'
    },
    quantumSpecific: { qubitCount: 4 },
    timing: { circuitDuration: 12, t1: 120, t2: 80, unit: 'us' },
    qubitTimeVolume: 48,
    qubitTimeVolumeNormalized: 0.6,
    errorRates: {
      qubit: { min: 0.001, max: 0.005, median: 0.003, mean: 0.0032 },
      readout: { min: 0.01, max: 0.03, median: 0.02, mean: 0.021 }
    },
    executionTime: { min: 0.5, max: 2.5, median: 1.2, mean: 1.3, unit: 'seconds' }
  },
  {
    id: 'test2',
    algorithmName: 'Another Algorithm',
    device: 'Another Device',
    metricName: 'Another Metric',
    metricValue: 0.85,
    uncertainty: null,
    paperUrl: null,
    contributor: null,
    timestamp: new Date('2024-01-02'),
    benchmarkFolder: 'test2',
    generalMetrics: null,
    problemSpecific: null,
    quantumSpecific: null,
    timing: null,
    qubitTimeVolume: null,
    qubitTimeVolumeNormalized: null,
    errorRates: null,
    executionTime: null
  }
];

const mockSortConfig = {
  key: 'timestamp',
  direction: 'desc'
};

const defaultProps = {
  filteredBenchmarks: mockBenchmarks,
  isLoading: false,
  searchQuery: '',
  setSearchQuery: jest.fn(),
  downloadCSV: jest.fn(),
  downloadJSON: jest.fn(),
  sortConfig: mockSortConfig,
  onSort: jest.fn()
};

describe('BenchmarkTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders table headers correctly', () => {
    render(<BenchmarkTable {...defaultProps} />);

    expect(screen.getByText('Experiment')).toBeInTheDocument();
    expect(screen.getByText('Device')).toBeInTheDocument();
    expect(screen.getByText('Qubits')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('renders benchmark data correctly', () => {
    render(<BenchmarkTable {...defaultProps} />);

    expect(screen.getByText('Test Algorithm')).toBeInTheDocument();
    expect(screen.getByText('Test Device')).toBeInTheDocument();
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('0.95')).toBeInTheDocument();
  });

  test('handles missing data gracefully', () => {
    render(<BenchmarkTable {...defaultProps} />);

    // The second benchmark should be rendered without errors
    expect(screen.getByText('Another Algorithm')).toBeInTheDocument();
    expect(screen.getByText('Another Device')).toBeInTheDocument();
    expect(screen.getByText('0.85')).toBeInTheDocument();
  });

  test('displays loading state', () => {
    render(<BenchmarkTable {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('displays empty search results', () => {
    render(<BenchmarkTable {...defaultProps} filteredBenchmarks={[]} searchQuery="nonexistent" />);

    expect(screen.getByText('No results found for "nonexistent".')).toBeInTheDocument();
  });

  test('download dropdown functionality', () => {
    render(<BenchmarkTable {...defaultProps} />);

    // Click the download button to open dropdown
    const downloadButton = screen.getByText('Download');
    fireEvent.click(downloadButton);

    // Check that dropdown options appear
    expect(screen.getByText('CSV - Visible Data')).toBeInTheDocument();
    expect(screen.getByText('JSON - All Data')).toBeInTheDocument();

    // Click CSV option
    fireEvent.click(screen.getByText('CSV - Visible Data'));
    expect(defaultProps.downloadCSV).toHaveBeenCalledTimes(1);

    // Open dropdown again
    fireEvent.click(downloadButton);

    // Click JSON option
    fireEvent.click(screen.getByText('JSON - All Data'));
    expect(defaultProps.downloadJSON).toHaveBeenCalledTimes(1);
  });

  test('calls sort function when header is clicked', () => {
    render(<BenchmarkTable {...defaultProps} />);

    const experimentHeader = screen.getByText('Experiment');
    fireEvent.click(experimentHeader);

    expect(defaultProps.onSort).toHaveBeenCalledWith('algorithmName');
  });

  test('search functionality works', () => {
    render(<BenchmarkTable {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    fireEvent.change(searchInput, { target: { value: 'test query' } });

    expect(defaultProps.setSearchQuery).toHaveBeenCalledWith('test query');
  });

  test('shows unified fidelities section in modal', () => {
    render(<BenchmarkTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Test Algorithm'));

    expect(screen.getByText('Fidelities')).toBeInTheDocument();
    expect(screen.getByText('Readout Fidelity')).toBeInTheDocument();
    expect(screen.getByText('Qubit Fidelity')).toBeInTheDocument();
    expect(screen.getByText('0.97900')).toBeInTheDocument();
    expect(screen.getByText('0.99680')).toBeInTheDocument();
    expect(screen.queryByText('Error Rates')).not.toBeInTheDocument();
    expect(screen.queryByText('Readout Error')).not.toBeInTheDocument();
  });

  test('shows timing coherence ratios when timing is present', () => {
    render(<BenchmarkTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Test Algorithm'));

    expect(screen.getByText('Timing & Coherence')).toBeInTheDocument();
    expect(screen.getByText('Runtime / T1')).toBeInTheDocument();
    expect(screen.getByText('Runtime / T2')).toBeInTheDocument();
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByText('15.00%')).toBeInTheDocument();
  });

  test('shows qubit time volume metrics when present', () => {
    render(<BenchmarkTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Test Algorithm'));

    expect(screen.getByText('Qubit Time Volume (raw)')).toBeInTheDocument();
    expect(screen.getByText('Qubit Time Volume (normalized, /T2)')).toBeInTheDocument();
    expect(screen.getByText('48.000 qubit*us')).toBeInTheDocument();
    expect(screen.getByText('0.600')).toBeInTheDocument();
  });

  test('renders timing coherence section with N/A when timing and QTV are absent', () => {
    render(<BenchmarkTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Another Algorithm'));

    expect(screen.getByText('Timing & Coherence')).toBeInTheDocument();
    expect(screen.getByText('Circuit Duration (us)')).toBeInTheDocument();
    expect(screen.getByText('Qubit Time Volume (raw)')).toBeInTheDocument();
    expect(screen.getByText('Qubit Time Volume (normalized, /T2)')).toBeInTheDocument();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

});
