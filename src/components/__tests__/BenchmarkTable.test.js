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
  sortConfig: mockSortConfig,
  onSort: jest.fn()
};

describe('BenchmarkTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders table headers correctly', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    expect(screen.getByText('Algorithm')).toBeInTheDocument();
    expect(screen.getByText('Device')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Uncertainty')).toBeInTheDocument();
    expect(screen.getByText('Paper')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
  });

  test('renders benchmark data correctly', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    expect(screen.getByText('Test Algorithm')).toBeInTheDocument();
    expect(screen.getByText('Test Device')).toBeInTheDocument();
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('0.95')).toBeInTheDocument();
    expect(screen.getByText('±0.02')).toBeInTheDocument();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  test('handles missing data gracefully', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    // Check for N/A values where data is missing
    expect(screen.getAllByText('N/A')).toHaveLength(1); // uncertainty for second item
    expect(screen.getAllByText('-')).toHaveLength(2); // paper and contributor for second item
  });

  test('displays loading state', () => {
    render(<BenchmarkTable {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('displays empty search results', () => {
    render(<BenchmarkTable {...defaultProps} filteredBenchmarks={[]} searchQuery="nonexistent" />);
    
    expect(screen.getByText('No results found for "nonexistent".')).toBeInTheDocument();
  });

  test('calls download CSV function when button is clicked', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    const downloadButton = screen.getByText('Download CSV');
    fireEvent.click(downloadButton);
    
    expect(defaultProps.downloadCSV).toHaveBeenCalledTimes(1);
  });

  test('calls sort function when header is clicked', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    const algorithmHeader = screen.getByText('Algorithm');
    fireEvent.click(algorithmHeader);
    
    expect(defaultProps.onSort).toHaveBeenCalledWith('algorithmName');
  });

  test('search functionality works', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    
    expect(defaultProps.setSearchQuery).toHaveBeenCalledWith('test query');
  });

  test('renders external links correctly', () => {
    render(<BenchmarkTable {...defaultProps} />);
    
    // Check contributor GitHub link
    const contributorLink = screen.getByTitle("View testuser's GitHub profile");
    expect(contributorLink).toHaveAttribute('href', 'https://github.com/testuser');
    expect(contributorLink).toHaveAttribute('target', '_blank');
    
    // Check paper link
    const paperLink = screen.getByTitle('View Paper');
    expect(paperLink).toHaveAttribute('href', 'https://example.com/paper');
    expect(paperLink).toHaveAttribute('target', '_blank');
  });
});