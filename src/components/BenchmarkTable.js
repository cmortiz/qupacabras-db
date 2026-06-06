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
    const gm = benchmark.generalMetrics || {};
    const ps = benchmark.problemSpecific || {};
    const primaryMetric = ps.primaryMetric || {};

    const lambda1SourceLabel = {
        explicit: 'from problem graph',
        qasm: 'from circuit connectivity'
    };

    const formatFidelity = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return 'N/A';
        return (1 - Number(val)).toFixed(5);
    };

    const formatFidelityRange = (stats) => {
        if (!stats) return { best: 'N/A', worst: 'N/A' };
        return {
            best: formatFidelity(stats.min),
            worst: formatFidelity(stats.max)
        };
    };

    const toDisplayFidelity = (explicitValue, errorStats) => {
        const explicit = explicitValue !== null && explicitValue !== undefined ? Number(explicitValue) : null;
        if (explicit !== null && !Number.isNaN(explicit)) return explicit.toFixed(5);
        return formatFidelity(errorStats?.mean);
    };

    const formatLambda1 = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return 'N/A';
        return Number(val).toFixed(4);
    };

    const coherenceFraction = (dur, coh) => {
        if (dur === null || dur === undefined || coh === null || coh === undefined || Number(coh) === 0) {
            return 'N/A';
        }
        if (Number.isNaN(Number(dur)) || Number.isNaN(Number(coh))) {
            return 'N/A';
        }
        return ((Number(dur) / Number(coh)) * 100).toFixed(2) + '%';
    };

    const formatQtvRaw = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return 'N/A';
        return `${Number(val).toFixed(3)} qubit*us`;
    };

    const formatQtvNormalized = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return 'N/A';
        return Number(val).toFixed(3);
    };

    const formatQubitRange = (range) => {
        if (!range || range.min === undefined || range.max === undefined) return 'N/A';
        return `${range.min}-${range.max}`;
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
                            <div style={{ fontSize: '1.125rem', fontWeight: '600', color: COLORS.accentAqua }}>{primaryMetric.name || benchmark.metricName}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: COLORS.accentOrange, fontFamily: 'monospace' }}>
                                {primaryMetric.value ?? benchmark.metricValue}
                                {(primaryMetric.uncertainty ?? benchmark.uncertainty) && <span style={{ fontSize: '1rem', color: COLORS.fgMuted, marginLeft: '0.5rem' }}>± {primaryMetric.uncertainty ?? benchmark.uncertainty}</span>}
                            </div>
                            {(primaryMetric.uncertaintyDefinition || benchmark.uncertaintyDefinition) && (
                                <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>
                                    ({primaryMetric.uncertaintyDefinition || benchmark.uncertaintyDefinition})
                                </div>
                            )}
                        </div>
                    </div>

                    {/* General Platform Metrics */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: COLORS.fg, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Cpu size={16} /> General Platform Metrics
                        </h3>

                        {/* Spectral */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.accentBlue, marginBottom: '0.5rem' }}>
                                Spectral Properties
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', backgroundColor: COLORS.bg, padding: '1rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>λ₁ (normalized Laplacian)</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{formatLambda1(gm.lambda1 ?? benchmark.lambda1)}</div>
                                    {(gm.lambda1Source || benchmark.lambda1Source) && (
                                        <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>
                                            {lambda1SourceLabel[gm.lambda1Source || benchmark.lambda1Source] || gm.lambda1Source || benchmark.lambda1Source}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Timing & Coherence */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.accentAqua, marginBottom: '0.5rem' }}>
                                Timing &amp; Coherence
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', backgroundColor: COLORS.bg, padding: '1rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Circuit Duration ({gm.timing?.unit || benchmark.timing?.unit || 'us'})</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{gm.timing?.circuitDuration ?? benchmark.timing?.circuitDuration ?? 'N/A'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>T1 ({gm.timing?.unit || benchmark.timing?.unit || 'us'})</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{gm.timing?.t1 ?? benchmark.timing?.t1 ?? 'N/A'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>T2 ({gm.timing?.unit || benchmark.timing?.unit || 'us'})</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{gm.timing?.t2 ?? benchmark.timing?.t2 ?? 'N/A'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Runtime / T1</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.accentGreen }}>
                                        {gm.runtimeOverT1 != null ? `${(Number(gm.runtimeOverT1) * 100).toFixed(2)}%` : coherenceFraction(gm.timing?.circuitDuration ?? benchmark.timing?.circuitDuration, gm.timing?.t1 ?? benchmark.timing?.t1)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Runtime / T2</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.accentGreen }}>
                                        {gm.runtimeOverT2 != null ? `${(Number(gm.runtimeOverT2) * 100).toFixed(2)}%` : coherenceFraction(gm.timing?.circuitDuration ?? benchmark.timing?.circuitDuration, gm.timing?.t2 ?? benchmark.timing?.t2)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>QTV (raw)</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.accentGreen }}>{formatQtvRaw(gm.qubitTimeVolume ?? benchmark.qubitTimeVolume)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>QTV (normalized /T2)</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.accentGreen }}>{formatQtvNormalized(gm.qubitTimeVolumeNormalized ?? benchmark.qubitTimeVolumeNormalized)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Fidelities */}
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.accentGreen, marginBottom: '0.5rem' }}>
                                Fidelities
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '0.75rem' }}>
                                <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>1-Qubit Gate Fidelity</div>
                                    <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{toDisplayFidelity(gm.gateFidelity?.oneQubit ?? benchmark.one_qubit_fidelity, benchmark.errorRates?.singleQubitGate)}</div>
                                </div>
                                <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>2-Qubit Gate Fidelity</div>
                                    <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{toDisplayFidelity(gm.gateFidelity?.twoQubit ?? benchmark.two_qubit_fidelity, benchmark.errorRates?.twoQubitGate)}</div>
                                </div>
                                <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Qubit Fidelity</div>
                                    <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{toDisplayFidelity(gm.qubitFidelity, benchmark.errorRates?.qubit)}</div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>Range: {formatFidelityRange(benchmark.errorRates?.qubit).best} – {formatFidelityRange(benchmark.errorRates?.qubit).worst}</div>
                                </div>
                                <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Readout Fidelity</div>
                                    <div style={{ fontFamily: 'monospace', color: COLORS.accentGreen, fontSize: '1.125rem' }}>{toDisplayFidelity(gm.readoutFidelity, benchmark.errorRates?.readout)}</div>
                                    <div style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}>Range: {formatFidelityRange(benchmark.errorRates?.readout).best} – {formatFidelityRange(benchmark.errorRates?.readout).worst}</div>
                                </div>
                            </div>
                            <div style={{ backgroundColor: COLORS.bg, padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Measurement Method</div>
                                <p style={{ fontSize: '0.875rem', color: COLORS.fg, lineHeight: '1.5', margin: 0 }}>
                                    {gm.gateFidelity?.measurementMethod || benchmark.fidelity_measurement_method || 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Problem-Specific Metrics */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: COLORS.fg, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={16} /> Problem-Specific Metrics
                        </h3>

                        {/* Circuit Parameters */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.accentOrange, marginBottom: '0.5rem' }}>
                                Circuit Parameters
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', backgroundColor: COLORS.bg, padding: '1rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Qubit Range</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{formatQubitRange(ps.qubitRange)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Depth Range</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{formatQubitRange(ps.depthRange)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Shots</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{ps.shots ?? benchmark.quantumSpecific?.shots ?? 'N/A'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Gates</div>
                                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', color: COLORS.fg }}>{benchmark.quantumSpecific?.gateCount ?? 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Experiment Definition */}
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.accentRed, marginBottom: '0.5rem' }}>
                                Experiment Definition
                            </div>
                            <div style={{ backgroundColor: COLORS.bg, padding: '1rem', borderRadius: '0.5rem', border: `1px solid ${COLORS.border}` }}>
                                <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Primary Metric Definition</div>
                                <div style={{ fontSize: '0.875rem', color: COLORS.fg, lineHeight: '1.5', marginBottom: '0.75rem' }}>{primaryMetric.definition || 'N/A'}</div>
                                <div style={{ fontSize: '0.8rem', color: COLORS.fgMuted, marginBottom: '0.2rem' }}>Description</div>
                                <div style={{ fontSize: '0.875rem', color: COLORS.fg, lineHeight: '1.5' }}>{ps.description || benchmark.description || 'No description provided.'}</div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {(ps.notes || benchmark.notes || ps.methodology || benchmark.methodology) && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: COLORS.fg }}>Methodology & Notes</h3>
                            <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: '1.5' }}>
                                {ps.methodology || benchmark.methodology || 'N/A'}
                            </p>
                            <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: '1.5' }}>{ps.notes || benchmark.notes || 'N/A'}</p>
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

    const formatQubitsForTable = (benchmark) => {
        const range = benchmark.problemSpecific?.qubitRange;
        if (range && range.min !== undefined && range.max !== undefined) {
            if (range.min === range.max) return range.min;
            return `${range.min}-${range.max}`;
        }
        return benchmark.quantumSpecific?.qubitCount || '-';
    };

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
                                    sortKey="problemSpecific.qubitRange.max"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem', textAlign: 'center' }}
                                >
                                    Qubits
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
                                <SortableHeader
                                    sortKey="acceptedDate"
                                    currentSort={sortConfig}
                                    onSort={onSort}
                                    style={{ padding: '1rem 1.5rem', textAlign: 'center' }}
                                >
                                    Accepted
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
                                            {formatQubitsForTable(bm)}
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
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center', color: COLORS.fgMuted, fontSize: '0.875rem' }}>
                                            {bm.acceptedDate ? bm.acceptedDate.toLocaleDateString() : '-'}
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
