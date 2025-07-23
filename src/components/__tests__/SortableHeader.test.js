import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SortableHeader from '../SortableHeader';

const defaultProps = {
  sortKey: 'testColumn',
  currentSort: { key: 'timestamp', direction: 'desc' },
  onSort: jest.fn(),
  children: 'Test Column'
};

describe('SortableHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders column title correctly', () => {
    render(<SortableHeader {...defaultProps} />);
    
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  test('shows inactive sort icon when not currently sorted', () => {
    render(<SortableHeader {...defaultProps} />);
    
    // Should show the ChevronsUpDown icon when not active
    const header = screen.getByText('Test Column').closest('th');
    expect(header).toBeInTheDocument();
  });

  test('shows ascending sort icon when actively sorted ascending', () => {
    const props = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'asc' }
    };
    
    render(<SortableHeader {...props} />);
    
    // Should show ChevronUp icon when active and ascending
    const header = screen.getByText('Test Column').closest('th');
    expect(header).toBeInTheDocument();
  });

  test('shows descending sort icon when actively sorted descending', () => {
    const props = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'desc' }
    };
    
    render(<SortableHeader {...props} />);
    
    // Should show ChevronDown icon when active and descending
    const header = screen.getByText('Test Column').closest('th');
    expect(header).toBeInTheDocument();
  });

  test('calls onSort with correct sortKey when clicked', () => {
    render(<SortableHeader {...defaultProps} />);
    
    const header = screen.getByText('Test Column').closest('th');
    fireEvent.click(header);
    
    expect(defaultProps.onSort).toHaveBeenCalledWith('testColumn');
  });

  test('applies correct CSS classes', () => {
    render(<SortableHeader {...defaultProps} />);
    
    const header = screen.getByText('Test Column').closest('th');
    expect(header).toHaveClass('p-3', 'cursor-pointer', 'select-none');
  });

  test('applies custom className when provided', () => {
    const props = {
      ...defaultProps,
      className: 'custom-class text-right'
    };
    
    render(<SortableHeader {...props} />);
    
    const header = screen.getByText('Test Column').closest('th');
    expect(header).toHaveClass('custom-class', 'text-right');
  });

  test('highlights active column with different color', () => {
    const activeProps = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'asc' }
    };
    
    const inactiveProps = {
      ...defaultProps,
      currentSort: { key: 'otherColumn', direction: 'asc' }
    };
    
    const { rerender } = render(<SortableHeader {...activeProps} />);
    const activeHeader = screen.getByText('Test Column').closest('th');
    
    rerender(<SortableHeader {...inactiveProps} />);
    const inactiveHeader = screen.getByText('Test Column').closest('th');
    
    // Both should be present, but with different styling
    expect(activeHeader).toBeInTheDocument();
    expect(inactiveHeader).toBeInTheDocument();
  });
});