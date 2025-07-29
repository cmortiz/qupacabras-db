import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DownloadDropdown from '../DownloadDropdown';

describe('DownloadDropdown', () => {
  const mockOnDownloadCSV = jest.fn();
  const mockOnDownloadJSON = jest.fn();

  const defaultProps = {
    onDownloadCSV: mockOnDownloadCSV,
    onDownloadJSON: mockOnDownloadJSON
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders download button', () => {
    render(<DownloadDropdown {...defaultProps} />);
    
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('shows dropdown options when clicked', () => {
    render(<DownloadDropdown {...defaultProps} />);
    
    // Initially dropdown should not be visible
    expect(screen.queryByText('CSV - Visible Data')).not.toBeInTheDocument();
    expect(screen.queryByText('JSON - All Data')).not.toBeInTheDocument();
    
    // Click download button
    fireEvent.click(screen.getByText('Download'));
    
    // Now dropdown options should be visible
    expect(screen.getByText('CSV - Visible Data')).toBeInTheDocument();
    expect(screen.getByText('JSON - All Data')).toBeInTheDocument();
    expect(screen.getByText('Download currently displayed columns only')).toBeInTheDocument();
    expect(screen.getByText('Download complete dataset with all details')).toBeInTheDocument();
  });

  test('calls onDownloadCSV when CSV option is clicked', () => {
    render(<DownloadDropdown {...defaultProps} />);
    
    // Open dropdown
    fireEvent.click(screen.getByText('Download'));
    
    // Click CSV option
    fireEvent.click(screen.getByText('CSV - Visible Data'));
    
    expect(mockOnDownloadCSV).toHaveBeenCalledTimes(1);
    
    // Dropdown should close after selection
    expect(screen.queryByText('CSV - Visible Data')).not.toBeInTheDocument();
  });

  test('calls onDownloadJSON when JSON option is clicked', () => {
    render(<DownloadDropdown {...defaultProps} />);
    
    // Open dropdown
    fireEvent.click(screen.getByText('Download'));
    
    // Click JSON option
    fireEvent.click(screen.getByText('JSON - All Data'));
    
    expect(mockOnDownloadJSON).toHaveBeenCalledTimes(1);
    
    // Dropdown should close after selection
    expect(screen.queryByText('JSON - All Data')).not.toBeInTheDocument();
  });

  test('closes dropdown when clicking outside', () => {
    render(
      <div>
        <DownloadDropdown {...defaultProps} />
        <button>Outside Button</button>
      </div>
    );
    
    // Open dropdown
    fireEvent.click(screen.getByText('Download'));
    expect(screen.getByText('CSV - Visible Data')).toBeInTheDocument();
    
    // Click outside
    fireEvent.mouseDown(screen.getByText('Outside Button'));
    
    // Dropdown should close
    expect(screen.queryByText('CSV - Visible Data')).not.toBeInTheDocument();
  });

  test('toggles dropdown on repeated clicks', () => {
    render(<DownloadDropdown {...defaultProps} />);
    
    const downloadButton = screen.getByText('Download');
    
    // Click to open
    fireEvent.click(downloadButton);
    expect(screen.getByText('CSV - Visible Data')).toBeInTheDocument();
    
    // Click to close
    fireEvent.click(downloadButton);
    expect(screen.queryByText('CSV - Visible Data')).not.toBeInTheDocument();
    
    // Click to open again
    fireEvent.click(downloadButton);
    expect(screen.getByText('CSV - Visible Data')).toBeInTheDocument();
  });
});