import React from 'react';
import { Search } from 'lucide-react';
import { COLORS } from '../constants';

export default function SearchBar({ searchQuery, setSearchQuery }) {
    return (
        <div style={{ flexGrow: 1, maxWidth: '24rem', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <Search 
                    style={{ 
                        position: 'absolute',
                        left: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '1.25rem',
                        height: '1.25rem',
                        color: COLORS.fgSubtle 
                    }} 
                />
                <input
                    type="text"
                    placeholder="Search benchmarks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                        width: '100%',
                        paddingLeft: '2.5rem',
                        paddingRight: '1rem',
                        paddingTop: '0.5rem',
                        paddingBottom: '0.5rem',
                        borderRadius: '0.5rem',
                        border: `1px solid ${COLORS.border}`,
                        fontSize: '0.875rem',
                        backgroundColor: COLORS.bg, 
                        color: COLORS.fg,
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = COLORS.accentAqua}
                    onBlur={(e) => e.target.style.borderColor = COLORS.border}
                />
            </div>
        </div>
    );
}