import React, { useState, useRef, useEffect } from 'react';
import { FileDown, ChevronDown } from 'lucide-react';
import { COLORS } from '../constants';

export default function DownloadDropdown({ onDownloadCSV, onDownloadJSON }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownloadCSV = () => {
        onDownloadCSV();
        setIsOpen(false);
    };

    const handleDownloadJSON = () => {
        onDownloadJSON();
        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    backgroundColor: COLORS.accentGreen,
                    color: COLORS.bg,
                    fontWeight: '600',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                    outline: 'none',
                    boxShadow: isOpen ? `0 0 0 3px ${COLORS.accentGreen}33` : 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
                <FileDown style={{ width: '1.25rem', height: '1.25rem' }} />
                Download
                <ChevronDown 
                    style={{ 
                        width: '1rem', 
                        height: '1rem',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }} 
                />
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        right: 0,
                        marginTop: '0.5rem',
                        width: '16rem',
                        backgroundColor: '#3c3836',
                        border: '1px solid #504945',
                        borderRadius: '0.5rem',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                        zIndex: 50
                    }}
                >
                    <button
                        onClick={handleDownloadCSV}
                        style={{ 
                            width: '100%',
                            padding: '0.75rem 1rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderBottom: `1px solid ${COLORS.border}`,
                            color: COLORS.fg,
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#504945'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ fontWeight: '500', color: COLORS.fg }}>CSV - Visible Data</span>
                        <span style={{ fontSize: '0.75rem', marginTop: '0.125rem', color: COLORS.fgMuted }}>
                            Download currently displayed columns only
                        </span>
                    </button>
                    <button
                        onClick={handleDownloadJSON}
                        style={{ 
                            width: '100%',
                            padding: '0.75rem 1rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: COLORS.fg,
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#504945'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ fontWeight: '500', color: COLORS.fg }}>JSON - All Data</span>
                        <span style={{ fontSize: '0.75rem', marginTop: '0.125rem', color: COLORS.fgMuted }}>
                            Download complete dataset with all details
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}