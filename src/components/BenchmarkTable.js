import React from 'react';
import ReactDOM from 'react-dom';
import { Database, FileDown, FileText, FolderOpen, Github } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';
import SearchBar from './SearchBar';
import SortableHeader from './SortableHeader';


// Component for metric value with all details on hover
function MetricValueWithDetails({ benchmark }) {
    const [isHovered, setIsHovered] = React.useState(false);
    const [tooltipPosition, setTooltipPosition] = React.useState({ top: 0, left: 0 });
    const valueRef = React.useRef(null);
    
    const formatErrorRate = (val) => {
        if (val === null || val === undefined) return 'N/A';
        return (val * 100).toFixed(3) + '%';
    };
    
    const formatDetailedErrorRate = (stats) => {
        if (!stats) return { mean: 'N/A', min: 'N/A', median: 'N/A', max: 'N/A' };
        return {
            mean: formatErrorRate(stats.mean),
            min: formatErrorRate(stats.min),
            median: formatErrorRate(stats.median),
            max: formatErrorRate(stats.max)
        };
    };
    
    const formatDetailedTime = (stats) => {
        if (!stats) return { mean: 'N/A', min: 'N/A', median: 'N/A', max: 'N/A' };
        const unit = stats.unit || 'seconds';
        return {
            mean: `${stats.mean?.toFixed(3) || 'N/A'} ${unit}`,
            min: `${stats.min?.toFixed(3) || 'N/A'} ${unit}`,
            median: `${stats.median?.toFixed(3) || 'N/A'} ${unit}`,
            max: `${stats.max?.toFixed(3) || 'N/A'} ${unit}`
        };
    };
    
    const handleMouseEnter = () => {
        if (valueRef.current) {
            const rect = valueRef.current.getBoundingClientRect();
            const tooltipHeight = 600; // Approximate height
            const tooltipWidth = 450;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            let top = rect.bottom + 8;
            let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            
            // Check if tooltip would go off bottom of viewport
            if (rect.bottom + tooltipHeight > viewportHeight) {
                top = rect.top - tooltipHeight - 8;
            }
            
            // Check if tooltip would go off right edge
            if (left + tooltipWidth > viewportWidth) {
                left = viewportWidth - tooltipWidth - 20;
            }
            
            // Check if tooltip would go off left edge
            if (left < 20) {
                left = 20;
            }
            
            setTooltipPosition({ top, left });
            setIsHovered(true);
        }
    };
    
    const handleMouseLeave = () => {
        setIsHovered(false);
    };
    
    return (
        <div 
            className="metric-value-wrapper relative inline-block" 
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <span 
                ref={valueRef}
                className="font-mono" 
                style={{ 
                    color: COLORS.accentOrange,
                    borderBottom: `2px dotted ${COLORS.accentOrange}`,
                    cursor: 'help'
                }}
            >
                {benchmark.metricValue}
            </span>
            {isHovered && ReactDOM.createPortal(
                <div 
                    className="metric-details-tooltip"
                    style={{ 
                        position: 'fixed',
                        backgroundColor: COLORS.bgCard,
                        border: `1px solid ${COLORS.border}`,
                        top: tooltipPosition.top,
                        left: tooltipPosition.left,
                        width: '450px',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                        fontSize: '0.875rem',
                        zIndex: 1000,
                        display: 'block'
                    }}
                >
                <div className="font-semibold mb-3" style={{ color: COLORS.accentAqua }}>
                    {benchmark.algorithmName} - All Metrics
                </div>
                
                {/* Primary Metric */}
                <div className="mb-3 pb-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <div className="flex justify-between mb-1">
                        <span style={{ color: COLORS.fgMuted }}>{benchmark.metricName}:</span>
                        <span className="font-mono" style={{ color: COLORS.accentOrange }}>
                            {benchmark.metricValue} {benchmark.uncertainty ? `±${benchmark.uncertainty}` : ''}
                        </span>
                    </div>
                </div>
                
                {/* Error Rates */}
                {benchmark.errorRates && (
                    <div className="mb-3">
                        <div className="font-medium mb-2" style={{ color: COLORS.fg }}>Error Rates</div>
                        <div className="space-y-2 pl-2">
                            {benchmark.errorRates.qubit && (
                                <div>
                                    <div className="font-medium mb-1" style={{ color: COLORS.fgMuted }}>Qubit Error:</div>
                                    <div className="grid grid-cols-4 gap-2 text-xs pl-2">
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Min:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.qubit).min}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Median:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.qubit).median}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Mean:</span>
                                            <div className="font-mono font-semibold" style={{ color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.qubit).mean}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Max:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.qubit).max}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {benchmark.errorRates.readout && (
                                <div>
                                    <div className="font-medium mb-1" style={{ color: COLORS.fgMuted }}>Readout Error:</div>
                                    <div className="grid grid-cols-4 gap-2 text-xs pl-2">
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Min:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.readout).min}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Median:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.readout).median}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Mean:</span>
                                            <div className="font-mono font-semibold" style={{ color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.readout).mean}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Max:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.readout).max}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {benchmark.errorRates.singleQubitGate && (
                                <div>
                                    <div className="font-medium mb-1" style={{ color: COLORS.fgMuted }}>1Q Gate Error:</div>
                                    <div className="grid grid-cols-4 gap-2 text-xs pl-2">
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Min:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.singleQubitGate).min}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Median:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.singleQubitGate).median}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Mean:</span>
                                            <div className="font-mono font-semibold" style={{ color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.singleQubitGate).mean}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Max:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.singleQubitGate).max}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {benchmark.errorRates.twoQubitGate && (
                                <div>
                                    <div className="font-medium mb-1" style={{ color: COLORS.fgMuted }}>2Q Gate Error:</div>
                                    <div className="grid grid-cols-4 gap-2 text-xs pl-2">
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Min:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.twoQubitGate).min}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Median:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.twoQubitGate).median}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Mean:</span>
                                            <div className="font-mono font-semibold" style={{ color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.twoQubitGate).mean}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: COLORS.fgSubtle }}>Max:</span>
                                            <div className="font-mono">{formatDetailedErrorRate(benchmark.errorRates.twoQubitGate).max}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Execution Time */}
                {benchmark.executionTime && (
                    <div className="mb-3">
                        <div className="font-medium mb-2" style={{ color: COLORS.fg }}>Execution Time</div>
                        <div className="grid grid-cols-4 gap-2 text-xs pl-2">
                            <div>
                                <span style={{ color: COLORS.fgSubtle }}>Min:</span>
                                <div className="font-mono">{formatDetailedTime(benchmark.executionTime).min}</div>
                            </div>
                            <div>
                                <span style={{ color: COLORS.fgSubtle }}>Median:</span>
                                <div className="font-mono">{formatDetailedTime(benchmark.executionTime).median}</div>
                            </div>
                            <div>
                                <span style={{ color: COLORS.fgSubtle }}>Mean:</span>
                                <div className="font-mono font-semibold" style={{ color: COLORS.accentGreen }}>{formatDetailedTime(benchmark.executionTime).mean}</div>
                            </div>
                            <div>
                                <span style={{ color: COLORS.fgSubtle }}>Max:</span>
                                <div className="font-mono">{formatDetailedTime(benchmark.executionTime).max}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Quantum Properties */}
                {benchmark.quantumSpecific && (
                    <div>
                        <div className="font-medium mb-2" style={{ color: COLORS.fg }}>Quantum Properties</div>
                        <div className="space-y-1 pl-2">
                            {benchmark.quantumSpecific.qubitCount && (
                                <div className="flex justify-between">
                                    <span style={{ color: COLORS.fgMuted }}>Qubits:</span>
                                    <span className="font-mono">{benchmark.quantumSpecific.qubitCount}</span>
                                </div>
                            )}
                            {benchmark.quantumSpecific.gateCount && (
                                <div className="flex justify-between">
                                    <span style={{ color: COLORS.fgMuted }}>Gates:</span>
                                    <span className="font-mono">{benchmark.quantumSpecific.gateCount}</span>
                                </div>
                            )}
                            {benchmark.quantumSpecific.circuitDepth && (
                                <div className="flex justify-between">
                                    <span style={{ color: COLORS.fgMuted }}>Depth:</span>
                                    <span className="font-mono">{benchmark.quantumSpecific.circuitDepth}</span>
                                </div>
                            )}
                            {benchmark.quantumSpecific.shots && (
                                <div className="flex justify-between">
                                    <span style={{ color: COLORS.fgMuted }}>Shots:</span>
                                    <span className="font-mono">{benchmark.quantumSpecific.shots}</span>
                                </div>
                            )}
                            {benchmark.quantumSpecific.circuitVariations && (
                                <div className="flex justify-between">
                                    <span style={{ color: COLORS.fgMuted }}>Circuit Variations:</span>
                                    <span className="font-mono">{benchmark.quantumSpecific.circuitVariations}</span>
                                </div>
                            )}
                        </div>
                        {benchmark.quantumSpecific.gateBreakdown && (
                            <div className="mt-2">
                                <div className="font-medium mb-1" style={{ color: COLORS.fgMuted }}>Gate Breakdown:</div>
                                <div className="grid grid-cols-2 gap-2 text-xs pl-2">
                                    {Object.entries(benchmark.quantumSpecific.gateBreakdown).map(([gate, count]) => (
                                        <div key={gate} className="flex justify-between">
                                            <span style={{ color: COLORS.fgSubtle }}>{gate.toUpperCase()}:</span>
                                            <span className="font-mono">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>,
                document.body
            )}
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
        <div className="w-full">
            <div className="shadow-lg rounded-lg overflow-hidden" style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, minHeight: 'calc(100vh - 16rem)' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-8 py-6" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                        <Database className="w-6 h-6" style={{ color: COLORS.accentAqua }} /> Benchmark Data
                    </h2>
                    <SearchBar 
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                    />
                    <button 
                        onClick={downloadCSV} 
                        className="font-semibold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2" 
                        style={{ 
                            backgroundColor: COLORS.accentGreen, 
                            color: COLORS.bg, 
                            '--tw-ring-color': COLORS.accentGreen, 
                            'ringOffsetColor': COLORS.bgCard 
                        }}
                    >
                        <FileDown className="w-5 h-5"/> Download CSV
                    </button>
                </div>
                <div className="table-container" style={{ maxHeight: 'calc(100vh - 24rem)', overflow: 'auto' }}>
                    <table className="w-full text-left table-auto">
                        <thead style={{ borderBottomColor: COLORS.border, borderBottomWidth: '2px' }}>
                            <tr className="font-semibold">
                                <SortableHeader 
                                    sortKey="algorithmName" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="px-8 py-5"
                                >
                                    Algorithm
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="device" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="px-8 py-5"
                                >
                                    Device
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="metricName" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="px-8 py-5"
                                >
                                    Metric
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="metricValue" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="px-8 py-5 text-right"
                                >
                                    <span style={{ 
                                        borderBottom: `1px dotted ${COLORS.fgSubtle}`,
                                        cursor: 'help'
                                    }}>
                                        Value
                                    </span>
                                </SortableHeader>
                                <SortableHeader 
                                    sortKey="timestamp" 
                                    currentSort={sortConfig} 
                                    onSort={onSort}
                                    className="px-8 py-5"
                                >
                                    Date
                                </SortableHeader>
                                <th className="px-8 py-5 text-center" style={{ color: COLORS.fgMuted }}>Links</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="text-center p-8" style={{ color: COLORS.fgMuted }}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredBenchmarks.length > 0 ? (
                                filteredBenchmarks.map((bm) => (
                                    <tr key={bm.id} className="hover:bg-[#504945]" style={{ borderBottomColor: COLORS.border, borderBottomWidth: '1px' }}>
                                        <td className="px-8 py-5 font-medium">{bm.algorithmName}</td>
                                        <td className="px-8 py-5">{bm.device}</td>
                                        <td className="px-8 py-5">{bm.metricName}</td>
                                        <td className="px-8 py-5 text-right">
                                            <MetricValueWithDetails benchmark={bm} />
                                        </td>
                                        <td className="px-8 py-5 font-mono text-sm">
                                            {bm.timestamp.toLocaleDateString('en-US', { 
                                                year: 'numeric', 
                                                month: 'short', 
                                                day: 'numeric'
                                            })}
                                        </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    {bm.paperUrl && (
                                                        <a 
                                                            href={bm.paperUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="hover:opacity-80 transition-all hover:scale-110"
                                                            style={{ color: COLORS.accentAqua }}
                                                            title="View Paper"
                                                        >
                                                            <FileText className="w-5 h-5" />
                                                        </a>
                                                    )}
                                                    <a 
                                                        href={`${CONFIG.githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="hover:opacity-80 transition-all hover:scale-110"
                                                        style={{ color: COLORS.accentBlue }}
                                                        title="View Source Files"
                                                    >
                                                        <FolderOpen className="w-5 h-5" />
                                                    </a>
                                                    {bm.contributor && (
                                                        <a 
                                                            href={`https://github.com/${bm.contributor}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="hover:opacity-80 transition-all hover:scale-110"
                                                            style={{ color: COLORS.fg }}
                                                            title={`Contributor: ${bm.contributor}`}
                                                        >
                                                            <Github className="w-5 h-5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center p-8" style={{ color: COLORS.fgMuted }}>
                                        {searchQuery ? `No results found for "${searchQuery}".` : 'No benchmarks available.'}
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