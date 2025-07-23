import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { COLORS } from '../constants';

export default function SortableHeader({ 
    children, 
    sortKey, 
    currentSort, 
    onSort, 
    className = "p-3" 
}) {
    const isActive = currentSort.key === sortKey;
    const direction = currentSort.direction;

    const getSortIcon = () => {
        if (!isActive) {
            return <ChevronsUpDown className="w-4 h-4 opacity-50" />;
        }
        return direction === 'asc' 
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />;
    };

    return (
        <th 
            className={`${className} cursor-pointer select-none hover:bg-opacity-10 hover:bg-white transition-colors duration-150`}
            onClick={() => onSort(sortKey)}
            style={{ 
                color: isActive ? COLORS.fg : COLORS.fgMuted 
            }}
        >
            <div className="flex items-center gap-2 justify-between">
                <span>{children}</span>
                <span style={{ color: isActive ? COLORS.accentAqua : COLORS.fgSubtle }}>
                    {getSortIcon()}
                </span>
            </div>
        </th>
    );
}