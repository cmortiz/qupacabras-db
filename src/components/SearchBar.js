import React from 'react';
import { Search } from 'lucide-react';
import { COLORS } from '../constants';

export default function SearchBar({ searchQuery, setSearchQuery }) {
    return (
        <div className="flex-grow max-w-sm w-full">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: COLORS.fgSubtle }} />
                <input
                    type="text"
                    placeholder="Search benchmarks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
                    style={{ 
                        backgroundColor: COLORS.bg, 
                        borderColor: COLORS.border, 
                        color: COLORS.fg 
                    }}
                />
            </div>
        </div>
    );
}