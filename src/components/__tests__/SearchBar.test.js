import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from '../SearchBar';

const defaultProps = {
  searchQuery: '',
  setSearchQuery: jest.fn()
};

describe('SearchBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders search input with correct placeholder', () => {
    render(<SearchBar {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveValue('');
  });

  test('displays current search query value', () => {
    render(<SearchBar {...defaultProps} searchQuery="test query" />);
    
    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    expect(searchInput).toHaveValue('test query');
  });

  test('calls setSearchQuery when input changes', () => {
    render(<SearchBar {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    fireEvent.change(searchInput, { target: { value: 'new search term' } });
    
    expect(defaultProps.setSearchQuery).toHaveBeenCalledWith('new search term');
  });

  test('renders search icon', () => {
    render(<SearchBar {...defaultProps} />);
    
    // The search icon should be present (lucide-react Search icon)
    const searchIcon = screen.getByRole('textbox').parentElement.querySelector('svg');
    expect(searchIcon).toBeInTheDocument();
  });

  test('has correct styling and structure', () => {
    render(<SearchBar {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search benchmarks...');
    
    // Check for expected CSS classes
    expect(searchInput).toHaveClass('w-full', 'pl-10', 'pr-4', 'py-2', 'rounded-lg', 'border', 'text-sm');
  });
});