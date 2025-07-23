import { renderHook, act } from '@testing-library/react';
import { useSortedData } from '../useSortedData';

const mockData = [
  {
    id: '1',
    algorithmName: 'Zebra Algorithm',
    device: 'Device B',
    metricValue: 0.8,
    uncertainty: 0.1,
    timestamp: new Date('2024-01-01')
  },
  {
    id: '2',
    algorithmName: 'Alpha Algorithm',
    device: 'Device A',
    metricValue: 0.9,
    uncertainty: null,
    timestamp: new Date('2024-01-02')
  },
  {
    id: '3',
    algorithmName: 'Beta Algorithm',
    device: 'Device C',
    metricValue: 0.7,
    uncertainty: 0.05,
    timestamp: new Date('2024-01-03')
  }
];

describe('useSortedData', () => {
  test('initializes with default sort (timestamp desc)', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    expect(result.current.sortConfig).toEqual({
      key: 'timestamp',
      direction: 'desc'
    });
    
    // Should be sorted by timestamp descending by default
    expect(result.current.sortedData[0].id).toBe('3'); // 2024-01-03
    expect(result.current.sortedData[1].id).toBe('2'); // 2024-01-02
    expect(result.current.sortedData[2].id).toBe('1'); // 2024-01-01
  });

  test('sorts alphabetically by algorithm name', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    act(() => {
      result.current.handleSort('algorithmName');
    });
    
    expect(result.current.sortConfig).toEqual({
      key: 'algorithmName',
      direction: 'asc'
    });
    
    // Should be sorted alphabetically ascending
    expect(result.current.sortedData[0].algorithmName).toBe('Alpha Algorithm');
    expect(result.current.sortedData[1].algorithmName).toBe('Beta Algorithm');
    expect(result.current.sortedData[2].algorithmName).toBe('Zebra Algorithm');
  });

  test('toggles sort direction when clicking same column', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    // First click - ascending
    act(() => {
      result.current.handleSort('algorithmName');
    });
    
    expect(result.current.sortConfig.direction).toBe('asc');
    
    // Second click on same column - descending
    act(() => {
      result.current.handleSort('algorithmName');
    });
    
    expect(result.current.sortConfig.direction).toBe('desc');
    
    // Should be sorted alphabetically descending
    expect(result.current.sortedData[0].algorithmName).toBe('Zebra Algorithm');
    expect(result.current.sortedData[1].algorithmName).toBe('Beta Algorithm');
    expect(result.current.sortedData[2].algorithmName).toBe('Alpha Algorithm');
  });

  test('sorts numerically by metric value', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    act(() => {
      result.current.handleSort('metricValue');
    });
    
    // Should be sorted by metric value ascending
    expect(result.current.sortedData[0].metricValue).toBe(0.7);
    expect(result.current.sortedData[1].metricValue).toBe(0.8);
    expect(result.current.sortedData[2].metricValue).toBe(0.9);
  });

  test('handles null/undefined values correctly', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    act(() => {
      result.current.handleSort('uncertainty');
    });
    
    // Null values should be sorted to the beginning for ascending
    expect(result.current.sortedData[0].uncertainty).toBe(null);
    expect(result.current.sortedData[1].uncertainty).toBe(0.05);
    expect(result.current.sortedData[2].uncertainty).toBe(0.1);
  });

  test('handles empty data array', () => {
    const { result } = renderHook(() => useSortedData([]));
    
    expect(result.current.sortedData).toEqual([]);
    expect(result.current.sortConfig).toEqual({
      key: 'timestamp',
      direction: 'desc'
    });
  });

  test('handles null/undefined data', () => {
    const { result } = renderHook(() => useSortedData(null));
    
    expect(result.current.sortedData).toBe(null);
  });

  test('sorts by timestamp correctly', () => {
    const { result } = renderHook(() => useSortedData(mockData));
    
    act(() => {
      result.current.handleSort('timestamp');
    });
    
    // First click should be ascending (oldest first)
    expect(result.current.sortedData[0].timestamp.getTime()).toBe(new Date('2024-01-01').getTime());
    expect(result.current.sortedData[1].timestamp.getTime()).toBe(new Date('2024-01-02').getTime());
    expect(result.current.sortedData[2].timestamp.getTime()).toBe(new Date('2024-01-03').getTime());
  });

  test('maintains sort when data changes', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useSortedData(data),
      { initialProps: { data: mockData } }
    );
    
    // Set sort to algorithm name
    act(() => {
      result.current.handleSort('algorithmName');
    });
    
    // Add new data
    const newData = [
      ...mockData,
      {
        id: '4',
        algorithmName: 'Gamma Algorithm',
        device: 'Device D',
        metricValue: 0.95,
        uncertainty: 0.02,
        timestamp: new Date('2024-01-04')
      }
    ];
    
    rerender({ data: newData });
    
    // Should maintain alphabetical sort
    expect(result.current.sortConfig.key).toBe('algorithmName');
    expect(result.current.sortedData[0].algorithmName).toBe('Alpha Algorithm');
    expect(result.current.sortedData[1].algorithmName).toBe('Beta Algorithm');
    expect(result.current.sortedData[2].algorithmName).toBe('Gamma Algorithm');
    expect(result.current.sortedData[3].algorithmName).toBe('Zebra Algorithm');
  });
});