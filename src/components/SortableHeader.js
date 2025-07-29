import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { COLORS } from '../constants';

export default function SortableHeader({ 
    children, 
    sortKey, 
    currentSort, 
    onSort, 
    style = {}
}) {
    const isActive = currentSort.key === sortKey;
    const direction = currentSort.direction;

    const getSortIcon = () => {
        if (!isActive) {
            return <ChevronsUpDown style={{ width: '1rem', height: '1rem', opacity: 0.5 }} />;
        }
        return direction === 'asc' 
            ? <ChevronUp style={{ width: '1rem', height: '1rem' }} />
            : <ChevronDown style={{ width: '1rem', height: '1rem' }} />;
    };

    return (
        <th 
            onClick={() => onSort(sortKey)}
            style={{ 
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background-color 0.15s',
                color: isActive ? COLORS.fg : COLORS.fgMuted,
                ...style
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                justifyContent: 'space-between' 
            }}>
                <span>{children}</span>
                <span style={{ color: isActive ? COLORS.accentAqua : COLORS.fgSubtle }}>
                    {getSortIcon()}
                </span>
            </div>
        </th>
    );
}