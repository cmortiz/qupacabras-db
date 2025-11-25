import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Database, FileText, FolderOpen, Github, X, FileCode, Activity, Cpu, Clock } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';
import SearchBar from './SearchBar';
import SortableHeader from './SortableHeader';
import DownloadDropdown from './DownloadDropdown';

// Modal component for detailed benchmark view
function BenchmarkDetailsModal({ benchmark, onClose }) {
    if (!benchmark) return null;

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

    return ReactDOM.createPortal(
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    zIndex: 40,
                    backdropFilter: 'blur(2px)'
                }}
                onClick={onClose}
            />
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '90vh',
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '0.75rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: `1px solid ${COLORS.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    backgroundColor: COLORS.bg
                }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: COLORS.fg, marginBottom: '0.5rem' }}>
                            {benchmark.algorithmName}
                        </h2>
                        <div style={{ display: 'flex', gap: '1rem', color: COLORS.fgMuted, fontSize: '0.875rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Cpu size={14} /> {benchmark.device}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Clock size={14} /> {benchmark.timestamp.toLocaleDateString()}
                            </span>
                            {benchmark.contributor && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Github size={14} /> @{benchmark.contributor}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: COLORS.fgMuted,
                            cursor: 'pointer',
                            padding: '0.25rem'
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                    {/* Primary Metric */}
                    <div style={{
                        backgroundColor: COLORS.bg,
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1.5rem',
                        border: `1px solid ${COLORS.border}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ color: COLORS.fgMuted, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Primary Metric</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: '600', color: COLORS.accentAqua }}>{benchmark.metricName}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: COLORS.accentOrange, fontFamily: 'monospace' }}>
                                {benchmark.metricValue}
                                {benchmark.uncertainty && <span style={{ fontSize: '1rem', color: COLORS.fgMuted, marginLeft: '0.5rem' }}>± {benchmark.uncertainty}</span>}
                            </div>
                            {benchmark.uncertaintyDefinition && (
                                <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>
                                    ({benchmark.uncertaintyDefinition})
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Description & Methodology */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: COLORS.fg }}>Description</h3>
                            <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: '1.5' }}>
                                {benchmark.description || 'No description provided.'}
                            </p>
                        </div>
                        {benchmark.methodology && (
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: COLORS.fg }}>Methodology</h3>
                                <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: '1.5' }}>
                                    {benchmark.methodology}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    {benchmark.notes && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: COLORS.fg }}>Notes</h3>
                            <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: '1.5' }}>
                                {benchmark.notes}
                            </p>
                        </div>
                    )}

                    {/* Quantum Specifics */}
                    {benchmark.quantumSpecific && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: COLORS.fg, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={16} /> Quantum Circuit Details
                            </h3>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '1rem',
                                backgroundColor: COLORS.bg,
                                padding: '1rem',
                                borderRadius: '0.5rem',
                                border: `1px solid ${COLORS.border}`
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted }}>Qubits</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{benchmark.quantumSpecific.qubitCount || '-'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted }}>Depth</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{benchmark.quantumSpecific.circuitDepth || '-'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted }}>Gates</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{benchmark.quantumSpecific.gateCount || '-'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted }}>Shots</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{benchmark.quantumSpecific.shots || '-'}</div>
                                </div>
                            </div>
                            {benchmark.quantumSpecific.sourceLocation && (
                                <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>Source Location</div>
                                    <div style={{ fontFamily: 'monospace', color: COLORS.fg, backgroundColor: COLORS.bg, padding: '0.5rem', borderRadius: '0.25rem', border: `1px solid ${COLORS.border}`, wordBreak: 'break-all' }}>
                                        {benchmark.quantumSpecific.sourceLocation}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error Rates */}
                    {benchmark.errorRates && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: COLORS.fg }}>Error Rates</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                {benchmark.errorRates.qubit && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>Qubit Error (Mean)</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.qubit).mean}</div>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>
                                            Range: {formatDetailedErrorRate(benchmark.errorRates.qubit).min} - {formatDetailedErrorRate(benchmark.errorRates.qubit).max}
                                        </div>
                                    </div>
                                )}
                                {benchmark.errorRates.readout && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>Readout Error (Mean)</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.readout).mean}</div>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>
                                            Range: {formatDetailedErrorRate(benchmark.errorRates.readout).min} - {formatDetailedErrorRate(benchmark.errorRates.readout).max}
                                        </div>
                                    </div>
                                )}
                                {benchmark.errorRates.singleQubitGate && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>1Q Gate Error (Mean)</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.singleQubitGate).mean}</div>
                                    </div>
                                )}
                                {benchmark.errorRates.twoQubitGate && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>2Q Gate Error (Mean)</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentOrange }}>{formatDetailedErrorRate(benchmark.errorRates.twoQubitGate).mean}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                    )}

                    {/* Gate Fidelities */}
                    {(benchmark.one_qubit_fidelity || benchmark.two_qubit_fidelity || benchmark.fidelity_measurement_method) && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: COLORS.fg }}>Gate Fidelities</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                {benchmark.one_qubit_fidelity && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>1-Qubit Fidelity</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{benchmark.one_qubit_fidelity}</div>
                                    </div>
                                )}
                                {benchmark.two_qubit_fidelity && (
                                    <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>2-Qubit Fidelity</div>
                                        <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{benchmark.two_qubit_fidelity}</div>
                                    </div>
                                )}
                            </div>
                            {benchmark.fidelity_measurement_method && (
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgMuted, marginBottom: '0.25rem' }}>Measurement Method</div>
                                    <p style={{ fontSize: '0.875rem', color: COLORS.fg, lineHeight: '1.5', margin: 0 }}>
                                        {benchmark.fidelity_measurement_method}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* QASM Files */}
                    {benchmark.qasmFiles && benchmark.qasmFiles.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: COLORS.fg, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileCode size={16} /> Circuit Files
                            </h3>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {benchmark.qasmFiles.map((file, idx) => (
                                    <a
                                        key={idx}
                                        href={`${CONFIG.githubRepoUrl}/blob/main/submissions/${benchmark.benchmarkFolder}/${file}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.5rem 0.75rem',
                                            backgroundColor: COLORS.bg,
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: '0.25rem',
                                            color: COLORS.accentBlue,
                                            textDecoration: 'none',
                                            fontSize: '0.875rem'
                                        }}
                                    >
                                        <FileCode size={14} /> {file}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Links */}
                    <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: `1px solid ${COLORS.border}` }}>
                        {benchmark.paperUrl && (
                            <a
                                href={benchmark.paperUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: COLORS.accentAqua,
                                    textDecoration: 'none',
                                    fontWeight: '500'
                                }}
                            >
                                <FileText size={16} /> Read Paper
                            </a>
                        )}
                        <a
                            href={`${CONFIG.githubRepoUrl}/tree/main/submissions/${benchmark.benchmarkFolder}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: COLORS.accentBlue,
                                textDecoration: 'none',
                                fontWeight: '500'
                            }}
                        >
                            <FolderOpen size={16} /> View Source
                        </a>
                    </div>
                </div>
            </div >
        </>,
        document.body
    );
}

export default function BenchmarkTable({
    filteredBenchmarks,
    isLoading,
    searchQuery,
    setSearchQuery,
    downloadCSV,
    downloadJSON,
    sortConfig,
    onSort
}) {
    const [selectedBenchmark, setSelectedBenchmark] = useState(null);

    return (
        <div style={{ width: '100%' }}>
            <div style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, minHeight: 'calc(100vh - 16rem)' }}>
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.5rem 2rem', borderBottom: `1px solid ${COLORS.border}` }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database style={{ width: '1.5rem', height: '1.5rem', color: COLORS.accentAqua }} /> Benchmark Data
                    </h2>
                    <SearchBar
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                    />
                    <DownloadDropdown
                        onDownloadCSV={downloadCSV}
                        onDownloadJSON={downloadJSON}
                    />
                </div>
                <div style={{ maxHeight: 'calc(100vh - 24rem)', overflow: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', tableLayout: 'auto' }}>
                        <thead style={{ borderBottom: `2px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}>
                            <tr style={{ fontWeight: '600' }}>
                                <SortableHeader
                                    sortKey="algorithmName"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem' }}
                                >
                                    Experiment
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="device"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem' }}
                                >
                                    Device
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="quantumSpecific.qubitCount"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem', textAlign: 'center' }}
                                >
                                    Qubits
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="acceptedDate"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem', textAlign: 'center' }}
                                >
                                    Accepted
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="metricName"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem' }}
                                >
                                    Metric
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="metricValue"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem', textAlign: 'right' }}
                                >
                                    Value
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="timestamp"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem' }}
                                >
                                    Date
                                </SortableHeader>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'center', color: COLORS.fgMuted }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: COLORS.fgMuted }}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredBenchmarks.length > 0 ? (
                                filteredBenchmarks.map((bm) => (
                                    <tr
                                        key={bm.id}
                                        style={{ borderBottom: `1px solid ${COLORS.border}`, transition: 'background-color 0.2s', cursor: 'pointer' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#504945'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        onClick={() => setSelectedBenchmark(bm)}
                                    >
                                        <td style={{ padding: '1rem 1.5rem', fontWeight: '500' }}>{bm.algorithmName}</td>
                                        <td style={{ padding: '1rem 1.5rem', color: COLORS.fgMuted }}>{bm.device}</td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '1rem' }}>
                                            {bm.quantumSpecific?.qubitCount || '-'}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center', color: COLORS.fgMuted, fontSize: '0.875rem' }}>
                                            {bm.acceptedDate ? bm.acceptedDate.toLocaleDateString() : '-'}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: COLORS.fgMuted }}>{bm.metricName}</td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <span style={{ fontFamily: 'monospace', color: COLORS.accentOrange, fontWeight: 'bold', fontSize: '1.125rem' }}>
                                                {bm.metricValue}
                                            </span>
                                            {bm.uncertainty && (
                                                <span style={{ fontSize: '0.875rem', color: COLORS.fgMuted, marginLeft: '0.25rem' }}>
                                                    ±{bm.uncertainty}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', fontSize: '1rem', color: COLORS.fgMuted }}>
                                            {bm.timestamp.toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                            <button
                                                style={{
                                                    background: 'none',
                                                    border: `1px solid ${COLORS.border}`,
                                                    borderRadius: '0.25rem',
                                                    padding: '0.25rem 0.5rem',
                                                    color: COLORS.accentBlue,
                                                    cursor: 'pointer',
                                                    fontSize: '0.875rem'
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedBenchmark(bm);
                                                }}
                                            >
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: COLORS.fgMuted }}>
                                        {searchQuery ? `No results found for "${searchQuery}".` : 'No benchmarks available.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>

            <BenchmarkDetailsModal
                benchmark={selectedBenchmark}
                onClose={() => setSelectedBenchmark(null)}
            />
        </div >
    );
}