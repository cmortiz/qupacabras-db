import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BenchmarkTable, { verificationState, recomputedDisagreement } from '../BenchmarkTable';

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
    expect(screen.getByText('Verification')).toBeInTheDocument();
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

    expect(screen.getByText('QTV (raw)')).toBeInTheDocument();
    expect(screen.getByText('QTV (normalized /T2)')).toBeInTheDocument();
    expect(screen.getByText('48.000 qubit*us')).toBeInTheDocument();
    expect(screen.getByText('0.600')).toBeInTheDocument();
  });

  test('renders timing coherence section with N/A when timing and QTV are absent', () => {
    render(<BenchmarkTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Another Algorithm'));

    expect(screen.getByText('Timing & Coherence')).toBeInTheDocument();
    expect(screen.getByText('Circuit Duration (us)')).toBeInTheDocument();
    expect(screen.getByText('QTV (raw)')).toBeInTheDocument();
    expect(screen.getByText('QTV (normalized /T2)')).toBeInTheDocument();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

});

/**
 * A minimal index entry carrying a verification block, of the shape
 * `scripts/generate-benchmark-index.js` attaches.
 */
function withVerification(id, verification) {
  return {
    id,
    algorithmName: id,
    device: 'Device',
    metricName: 'Win Rate',
    metricValue: 0.99,
    uncertainty: null,
    timestamp: new Date('2026-08-22'),
    benchmarkFolder: id,
    verification
  };
}

describe('verification status', () => {
  test('an entry with no verification block is marked not verified', () => {
    // The 18 legacy entries predate the counts format. They are valid unverified assertions and
    // must say so rather than borrowing the look of a checked result.
    render(<BenchmarkTable {...defaultProps} />);
    expect(screen.getAllByText('Not verified')).toHaveLength(2);
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  test('each index status renders its own marker', () => {
    const benchmarks = [
      withVerification('pass', { status: 'verified', ranked: true }),
      withVerification('fail', { status: 'failed', ranked: false }),
      withVerification('over', { status: 'overridden', ranked: false }),
      withVerification('none', { status: 'unverified', ranked: false })
    ];
    render(<BenchmarkTable {...defaultProps} filteredBenchmarks={benchmarks} />);

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
  });

  test('a failed row does not render identically to a verified one', () => {
    // The defect this guards: a claim that provably does not reproduce from its own counts once
    // displayed byte-for-byte the same as one that does. The two entries below differ in nothing
    // except their verification status, so any difference in the markup comes from the marker.
    const rowText = (status) => {
      const { unmount } = render(
        <BenchmarkTable
          {...defaultProps}
          filteredBenchmarks={[withVerification('same', { status, ranked: status === 'verified' })]}
        />
      );
      // Row 0 is the header; row 1 is the single data row these props render.
      const text = screen.getAllByRole('row')[1].textContent;
      unmount();
      return text;
    };

    const verified = rowText('verified');
    expect(rowText('failed')).not.toEqual(verified);
    expect(rowText('overridden')).not.toEqual(verified);
    expect(rowText('unverified')).not.toEqual(verified);
  });

  test('the recomputed win rate is shown when it disagrees with the claim', () => {
    const benchmarks = [
      withVerification('mismatch', {
        status: 'failed',
        ranked: false,
        winRate: { claimed: 0.99, recomputedMean: 0.8125, delta: 0.1775 }
      })
    ];
    render(<BenchmarkTable {...defaultProps} filteredBenchmarks={benchmarks} />);

    expect(screen.getByText(/recomputed 0\.8125/)).toBeInTheDocument();
    expect(screen.getByText(/0\.1775/)).toBeInTheDocument();
  });

  test('a claim that reproduced exactly shows no second number', () => {
    const benchmarks = [
      withVerification('clean', {
        status: 'verified',
        ranked: true,
        winRate: { claimed: 0.8125, recomputedMean: 0.8125, delta: 0 }
      })
    ];
    render(<BenchmarkTable {...defaultProps} filteredBenchmarks={benchmarks} />);

    expect(screen.queryByText(/recomputed/)).not.toBeInTheDocument();
  });
});

describe('verificationState', () => {
  test('maps every index status, and defaults to unverified', () => {
    expect(verificationState({ verification: { status: 'verified' } }).key).toBe('verified');
    expect(verificationState({ verification: { status: 'failed' } }).key).toBe('failed');
    expect(verificationState({ verification: { status: 'overridden' } }).key).toBe('overridden');
    expect(verificationState({ verification: { status: 'unverified' } }).key).toBe('unverified');
  });

  test('anything it does not understand is unverified, never verified', () => {
    // A status this code cannot read is not one it may present as checked.
    for (const entry of [{}, null, undefined, { verification: null }, { verification: 'verified' },
      { verification: {} }, { verification: { status: 'ok' } }, { verification: { status: 42 } },
      { verification: { status: '__proto__' } }, { verification: { status: 'constructor' } }]) {
      expect(verificationState(entry).key).toBe('unverified');
    }
  });
});

describe('recomputedDisagreement', () => {
  test('reports a disagreement only when the delta is a nonzero finite number', () => {
    expect(recomputedDisagreement({
      verification: { winRate: { recomputedMean: 0.5, delta: 0.25 } }
    })).toEqual({ value: 0.5, delta: 0.25 });

    for (const winRate of [{ recomputedMean: 0.5, delta: 0 }, { recomputedMean: 0.5 },
      { recomputedMean: null, delta: 0.25 }, { recomputedMean: 0.5, delta: NaN },
      { recomputedMean: Infinity, delta: 0.25 }, { recomputedMean: '0.5', delta: 0.25 }]) {
      expect(recomputedDisagreement({ verification: { winRate } })).toBeNull();
    }
    expect(recomputedDisagreement({ verification: {} })).toBeNull();
    expect(recomputedDisagreement({})).toBeNull();
    expect(recomputedDisagreement(null)).toBeNull();
  });
});
