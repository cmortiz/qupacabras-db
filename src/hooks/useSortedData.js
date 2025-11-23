import { useState, useMemo } from 'react';

// Helper function to get nested property value
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current?.[key];
    }, obj);
}

export function useSortedData(data) {
    const [sortConfig, setSortConfig] = useState({
        key: 'timestamp',
        direction: 'desc'
    });

    const sortedData = useMemo(() => {
        if (!data || data.length === 0) return data;

        const sortedArray = [...data].sort((a, b) => {
            const { key, direction } = sortConfig;

            // Support nested properties like 'errorRates.qubit.mean'
            let aValue = getNestedValue(a, key);
            let bValue = getNestedValue(b, key);

            // Handle different data types
            if (key === 'timestamp') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            } else if (key === 'metricValue' || key === 'uncertainty' || key.includes('Count') || key.includes('Depth') || key.includes('shots') || key.includes('.mean') || key.includes('.min') || key.includes('.max') || key.includes('.median')) {
                aValue = parseFloat(aValue) || 0;
                bValue = parseFloat(bValue) || 0;
            } else if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            // Handle null/undefined values
            if (aValue == null && bValue == null) return 0;
            if (aValue == null) return direction === 'asc' ? -1 : 1;
            if (bValue == null) return direction === 'asc' ? 1 : -1;

            // Compare values
            let result = 0;
            if (aValue < bValue) result = -1;
            else if (aValue > bValue) result = 1;

            return direction === 'desc' ? -result : result;
        });

        return sortedArray;
    }, [data, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prevConfig => ({
            key,
            direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return {
        sortedData,
        sortConfig,
        handleSort
    };
}