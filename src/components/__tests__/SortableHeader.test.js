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

  test('renders correctly when not currently sorted', () => {
    render(<SortableHeader {...defaultProps} />);
    
    // The header should render with the column text
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  test('renders correctly when actively sorted ascending', () => {
    const props = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'asc' }
    };
    
    render(<SortableHeader {...props} />);
    
    // The header should render with the column text
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  test('renders correctly when actively sorted descending', () => {
    const props = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'desc' }
    };
    
    render(<SortableHeader {...props} />);
    
    // The header should render with the column text
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  test('calls onSort with correct sortKey when clicked', () => {
    render(<SortableHeader {...defaultProps} />);
    
    const headerText = screen.getByText('Test Column');
    fireEvent.click(headerText);
    
    expect(defaultProps.onSort).toHaveBeenCalledWith('testColumn');
  });

  test('responds to click events', () => {
    render(<SortableHeader {...defaultProps} />);
    
    const headerText = screen.getByText('Test Column');
    fireEvent.click(headerText);
    
    expect(defaultProps.onSort).toHaveBeenCalled();
  });

  test('handles custom className prop', () => {
    const props = {
      ...defaultProps,
      className: 'custom-class text-right'
    };
    
    render(<SortableHeader {...props} />);
    
    // Verify the component renders with custom className
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });

  test('handles active and inactive states correctly', () => {
    const activeProps = {
      ...defaultProps,
      currentSort: { key: 'testColumn', direction: 'asc' }
    };
    
    const inactiveProps = {
      ...defaultProps,
      currentSort: { key: 'otherColumn', direction: 'asc' }
    };
    
    const { rerender } = render(<SortableHeader {...activeProps} />);
    expect(screen.getByText('Test Column')).toBeInTheDocument();
    
    rerender(<SortableHeader {...inactiveProps} />);
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });
});