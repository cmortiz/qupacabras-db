import React from 'react';
import { Database, FileDown, ScrollText, FileText, User, HelpCircle } from 'lucide-react';
import { COLORS, CONFIG, FIELD_DESCRIPTIONS } from '../constants';
import SearchBar from './SearchBar';
import SortableHeader from './SortableHeader';

// Helper component for header with tooltip
function HeaderWithTooltip({ children, description }) {
    return (
        <div className="header-tooltip-wrapper relative inline-flex items-center justify-center gap-1">
            {children}
            <HelpCircle className="w-3 h-3" style={{ color: COLORS.fgSubtle, cursor: 'help' }} />
            <div 
                className="header-tooltip"
                style={{ 
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    position: 'absolute',
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    top: '100%',
                    marginTop: '0.5rem',
                    width: '250px',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                    fontSize: '0.75rem',
                    fontWeight: 'normal',
                    textAlign: 'left',
                    color: COLORS.fg,
                    zIndex: 100
                }}
            >
                {description}
            </div>
        </div>
    );
}

// Helper component for displaying statistical values
function StatValue({ stats, label, isErrorRate = true }) {
    if (!stats) return <span style={{ color: COLORS.fgSubtle }}>N/A</span>;
    
    const formatValue = (val) => {
        if (val === null || val === undefined) return 'N/A';
        if (isErrorRate) {
            return (val * 100).toFixed(3) + '%';
        }
        return val.toFixed(3) + (stats.unit ? ` ${stats.unit.charAt(0)}` : 's');
    };
    
    const formatFullValue = (val) => {
        if (val === null || val === undefined) return 'N/A';
        if (isErrorRate) {
            return (val * 100).toFixed(4) + '%';
        }
        return val.toFixed(3) + ' ' + (stats.unit || 'seconds');
    };
    
    return (
        <div className="stat-value-wrapper relative inline-block">
            <span 
                className="font-mono text-sm" 
                style={{ 
                    color: COLORS.accentOrange,
                    borderBottom: `1px dotted ${COLORS.fgSubtle}`,
                    cursor: 'help'
                }}
            >
                {formatValue(stats.mean)}
            </span>
            <div 
                className="stat-tooltip"
                style={{ 
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    top: '100%',
                    marginTop: '0.25rem',
                    width: '200px',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                    fontSize: '0.875rem'
                }}
            >
                <div className="font-semibold mb-2" style={{ color: COLORS.accentAqua }}>{label}</div>
                <div style={{ color: COLORS.fg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ color: COLORS.fgMuted }}>Min:</span>
                        <span className="font-mono" style={{ marginLeft: '0.5rem' }}>{formatFullValue(stats.min)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ color: COLORS.fgMuted }}>Median:</span>
                        <span className="font-mono" style={{ marginLeft: '0.5rem' }}>{formatFullValue(stats.median)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ color: COLORS.fgMuted }}>Mean:</span>
                        <span className="font-mono font-semibold" style={{ marginLeft: '0.5rem' }}>{formatFullValue(stats.mean)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: COLORS.fgMuted }}>Max:</span>
                        <span className="font-mono" style={{ marginLeft: '0.5rem' }}>{formatFullValue(stats.max)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BenchmarkTable({ 
    filteredBenchmarks, 
    isLoading, 
    searchQuery, 
    setSearchQuery, 
    downloadCSV,
    sortConfig,
    onSort
}) {
    return (
        <div className="lg:col-span-2">
            <div className="p-6 rounded-xl shadow-md" style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border, borderWidth: '1px' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                        <Database className="w-6 h-6" style={{ color: COLORS.accentAqua }} /> Benchmark Data
                    </h2>
                    <SearchBar 
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                    />
                    <button 
                        onClick={downloadCSV} 
                        className="font-semibold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2 text-sm" 
                        style={{ 
                            backgroundColor: COLORS.accentGreen, 
                            color: COLORS.bg, 
                            '--tw-ring-color': COLORS.accentGreen, 
                            'ringOffsetColor': COLORS.bgCard 
                        }}
                    >
                        <FileDown className="w-4 h-4"/> Download CSV
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto">
                        <thead style={{ borderBottomColor: COLORS.border, borderBottomWidth: '2px' }}>
                            <tr className="text-sm font-semibold">
                                <SortableHeader 
                                    sortKey="algorithmName" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                >
                                    Algorithm
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="device" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                >
                                    Device
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="metricName" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                >
                                    Metric
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="metricValue" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-right"
                                >
                                    Value
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="uncertainty" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-right"
                                >
                                    Uncertainty
                                </SortableHeader>
                                {/* Error Rate Columns */}
                                <SortableHeader 
                                    sortKey="errorRates.qubit.mean" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    <HeaderWithTooltip description={FIELD_DESCRIPTIONS.errorRates.qubit.description}>
                                        {FIELD_DESCRIPTIONS.errorRates.qubit.title}
                                    </HeaderWithTooltip>
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="errorRates.readout.mean" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    <HeaderWithTooltip description={FIELD_DESCRIPTIONS.errorRates.readout.description}>
                                        {FIELD_DESCRIPTIONS.errorRates.readout.title}
                                    </HeaderWithTooltip>
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="errorRates.twoQubitGate.mean" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    <HeaderWithTooltip description={FIELD_DESCRIPTIONS.errorRates.twoQubitGate.description}>
                                        {FIELD_DESCRIPTIONS.errorRates.twoQubitGate.title}
                                    </HeaderWithTooltip>
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="errorRates.singleQubitGate.mean" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    <HeaderWithTooltip description={FIELD_DESCRIPTIONS.errorRates.singleQubitGate.description}>
                                        {FIELD_DESCRIPTIONS.errorRates.singleQubitGate.title}
                                    </HeaderWithTooltip>
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="executionTime.mean" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    <HeaderWithTooltip description={FIELD_DESCRIPTIONS.executionTime.description}>
                                        {FIELD_DESCRIPTIONS.executionTime.title}
                                    </HeaderWithTooltip>
                                </SortableHeader>
                                <th className="p-3 text-center" style={{ color: COLORS.fgMuted }}>Paper</th>
                                <th className="p-3 text-center" style={{ color: COLORS.fgMuted }}>Files</th>
                                <SortableHeader 
                                    sortKey="contributor" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="p-3 text-center"
                                >
                                    Contributor
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="timestamp" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                >
                                    Timestamp
                                </SortableHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="14" className="text-center p-8" style={{ color: COLORS.fgMuted }}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredBenchmarks.length > 0 ? (
                                filteredBenchmarks.map(bm => (
                                    <tr key={bm.id} className="hover:bg-[#504945]" style={{ borderBottomColor: COLORS.border, borderBottomWidth: '1px' }}>
                                        <td className="p-3 font-medium">{bm.algorithmName}</td>
                                        <td className="p-3" style={{ color: COLORS.fgMuted }}>{bm.device}</td>
                                        <td className="p-3" style={{ color: COLORS.fgMuted }}>{bm.metricName}</td>
                                        <td className="p-3 text-right font-mono" style={{ color: COLORS.accentOrange }}>
                                            {bm.metricValue}
                                        </td>
                                        <td className="p-3 text-right font-mono" style={{ color: COLORS.fgSubtle }}>
                                            {bm.uncertainty != null ? `±${bm.uncertainty}` : 'N/A'}
                                        </td>
                                        {/* Error Rate Cells */}
                                        <td className="p-3 text-center">
                                            <StatValue 
                                                stats={bm.errorRates?.qubit} 
                                                label="Qubit Error Rate"
                                            />
                                        </td>
                                        <td className="p-3 text-center">
                                            <StatValue 
                                                stats={bm.errorRates?.readout} 
                                                label="Readout Error Rate"
                                            />
                                        </td>
                                        <td className="p-3 text-center">
                                            <StatValue 
                                                stats={bm.errorRates?.twoQubitGate} 
                                                label="Two-Qubit Gate Error"
                                            />
                                        </td>
                                        <td className="p-3 text-center">
                                            <StatValue 
                                                stats={bm.errorRates?.singleQubitGate} 
                                                label="Single-Qubit Gate Error"
                                            />
                                        </td>
                                        <td className="p-3 text-center">
                                            <StatValue 
                                                stats={bm.executionTime} 
                                                label="Execution Time"
                                                isErrorRate={false}
                                            />
                                        </td>
                                        <td className="p-3 text-center">
                                            {bm.paperUrl ? (
                                                <a 
                                                    href={bm.paperUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title="View Paper" 
                                                    className="inline-block p-1 rounded-full hover:opacity-80 transition-opacity" 
                                                    style={{ color: COLORS.accentAqua }}
                                                >
                                                    <ScrollText className="w-5 h-5"/>
                                                </a>
                                            ) : (
                                                <span style={{ color: COLORS.border }}>-</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <a 
                                                href={`${CONFIG.githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                title="View all files" 
                                                className="inline-block p-1 rounded-full hover:opacity-80 transition-opacity" 
                                                style={{ color: COLORS.accentAqua }}
                                            >
                                                <FileText className="w-5 h-5"/>
                                            </a>
                                        </td>
                                        <td className="p-3 text-center">
                                            {bm.contributor ? (
                                                <a 
                                                    href={`https://github.com/${bm.contributor}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title={`View ${bm.contributor}'s GitHub profile`} 
                                                    className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity" 
                                                    style={{ color: COLORS.accentAqua }}
                                                >
                                                    <User className="w-4 h-4"/>
                                                    {bm.contributor}
                                                </a>
                                            ) : (
                                                <span style={{ color: COLORS.border }}>-</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-sm" style={{ color: COLORS.fgSubtle }}>
                                            {bm.timestamp.toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="14" className="text-center p-8" style={{ color: COLORS.fgMuted }}>
                                        No results found for "{searchQuery}".
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}