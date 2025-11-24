import React, { useState, useEffect } from 'react';
import { Github, Info, FilePlus, Rocket } from 'lucide-react';
import ContributionGuide from './components/ContributionGuide';
import BenchmarkTable from './components/BenchmarkTable';
import { COLORS, CONFIG, UI_CONSTANTS } from './constants';
import { useSortedData } from './hooks/useSortedData';
import { useWindowSize } from './hooks/useWindowSize';

function App() {
    const [benchmarks, setBenchmarks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showGuide, setShowGuide] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [showLightbox, setShowLightbox] = useState(false);

    useEffect(() => {
        fetch(process.env.PUBLIC_URL + '/benchmarks.json')
            .then(response => response.json())
            .then(data => {
                // Convert timestamp strings to Date objects
                const processedData = data.map(benchmark => ({
                    ...benchmark,
                    timestamp: new Date(benchmark.timestamp)
                }));
                setBenchmarks(processedData);
                setIsLoading(false);
            })
            .catch(error => {
                console.error('Error loading benchmark data:', error);
                setBenchmarks([]);
                setIsLoading(false);
            });
    }, []);

    // Filter benchmarks based on search query
    const filteredBenchmarks = benchmarks.filter(benchmark => {
        const searchLower = searchQuery.toLowerCase();
        return (
            benchmark.algorithmName?.toLowerCase().includes(searchLower) ||
            benchmark.device?.toLowerCase().includes(searchLower) ||
            benchmark.metricName?.toLowerCase().includes(searchLower) ||
            benchmark.team?.some(member => member.toLowerCase().includes(searchLower)) ||
            benchmark.contributor?.toLowerCase().includes(searchLower)
        );
    });

    // Sort functionality - use filtered data
    const { sortedData, sortConfig, handleSort } = useSortedData(filteredBenchmarks);

    // Download CSV with only visible columns
    const downloadCSV = () => {
        if (sortedData.length === 0) {
            alert("No data available to download.");
            return;
        }

        // Only include the visible columns
        const headers = ['Algorithm', 'Device', 'Qubits', 'Depth', 'Metric', 'Value', 'Uncertainty', 'Submission_Date', 'Paper_URL', 'Source_URL'];

        const rows = sortedData.map(bm => {
            const sourceUrl = `${CONFIG.githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`;

            return [
                `"${bm.algorithmName}"`,
                `"${bm.device || 'N/A'}"`,
                bm.quantumSpecific?.qubitCount || '',
                bm.quantumSpecific?.circuitDepth || '',
                `"${bm.metricName}"`,
                bm.metricValue,
                bm.uncertainty || '',
                `"${bm.timestamp.toISOString().split('T')[0]}"`,
                `"${bm.paperUrl || 'N/A'}"`,
                `"${sourceUrl}"`
            ].join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(',') + "\n"
            + rows.join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `quantum_benchmarks_${new Date().toISOString().split('T')[0]}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Download JSON with all detailed data
    const downloadJSON = () => {
        if (benchmarks.length === 0) {
            alert("No data available to download.");
            return;
        }

        // Convert dates back to ISO strings for JSON
        const dataForExport = benchmarks.map(bm => ({
            ...bm,
            timestamp: bm.timestamp.toISOString()
        }));

        const jsonContent = JSON.stringify(dataForExport, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `quantum_benchmarks_full_${new Date().toISOString().split('T')[0]}.json`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const { width } = useWindowSize();
    const isMobile = width < 768;

    return (
        <div style={{
            minHeight: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
            backgroundColor: COLORS.bg,
            color: COLORS.fg
        }}>
            {/* Header with padding from top */}
            <header style={{
                paddingTop: '2rem',
                paddingBottom: '1.5rem',
                paddingLeft: isMobile ? '1rem' : '3rem',
                paddingRight: isMobile ? '1rem' : '3rem'
            }}>
                <div style={{
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`
                }}>
                    <div style={{ padding: isMobile ? '1.5rem 1rem' : '1.5rem 2rem' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'space-between',
                            alignItems: isMobile ? 'center' : 'stretch',
                            gap: '2rem',
                            textAlign: isMobile ? 'center' : 'left'
                        }}>
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isMobile ? 'center' : 'flex-start'
                            }}>
                                <h1 style={{ fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: 'bold', lineHeight: '1.2', marginBottom: '0.5rem' }}>
                                    <span style={{ color: COLORS.accentRed }}>Q</span>upacabras-DB
                                </h1>
                                <p
                                    className="app-description"
                                    style={{
                                        fontSize: '1.125rem',
                                        color: COLORS.fgMuted,
                                        maxWidth: '100%',
                                        margin: 0,
                                        lineHeight: '1.6',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    {UI_CONSTANTS.appDescription}
                                </p>
                                <div style={{ fontSize: '0.875rem', color: COLORS.fgMuted, marginTop: 'auto' }}>
                                    <button
                                        onClick={() => setShowGuide(true)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            color: COLORS.fgMuted,
                                            cursor: 'pointer',
                                            fontSize: 'inherit',
                                            fontFamily: 'inherit',
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.375rem'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = COLORS.accentBlue}
                                        onMouseLeave={(e) => e.currentTarget.style.color = COLORS.fgMuted}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}>
                                            <FilePlus style={{ width: '1.25em', height: '1.25em' }} />
                                            <Rocket style={{ width: '1.25em', height: '1.25em' }} />
                                        </div>
                                        <span><strong style={{ color: COLORS.accentBlue }}>Contribute</strong> to the database</span>
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setShowLightbox(true)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'zoom-in',
                                        transition: 'transform 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    title="Click to enlarge"
                                >
                                    <img
                                        src={process.env.PUBLIC_URL + '/qupacabras-db.gif'}
                                        alt="Qupacabras-DB Animation"
                                        style={{
                                            height: '10rem',
                                            width: 'auto',
                                            borderRadius: '0.5rem',
                                            imageRendering: 'pixelated',
                                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
                                        }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Lightbox for Header GIF */}
            {showLightbox && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out'
                    }}
                    onClick={() => setShowLightbox(false)}
                >
                    <img
                        src={process.env.PUBLIC_URL + '/qupacabras-db.gif'}
                        alt="Qupacabras-DB Animation (Large)"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            imageRendering: 'pixelated',
                            borderRadius: '0.5rem',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}
                    />
                </div>
            )}

            {/* Main content area - full width */}
            <main style={{ paddingLeft: '3rem', paddingRight: '3rem', paddingBottom: '2rem' }}>
                <BenchmarkTable
                    filteredBenchmarks={sortedData}
                    isLoading={isLoading}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    downloadCSV={downloadCSV}
                    downloadJSON={downloadJSON}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            </main>

            {/* Floating Action Button for Contribution Guide */}
            <button
                onClick={() => setShowGuide(!showGuide)}
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    right: '1.5rem',
                    width: '3.5rem',
                    height: '3.5rem',
                    borderRadius: '50%',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    zIndex: 50,
                    backgroundColor: COLORS.accentBlue,
                    color: COLORS.bg,
                    border: 'none',
                    cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                title="How to Contribute"
            >
                <Github style={{ width: '1.5rem', height: '1.5rem' }} />
            </button>

            {/* Contribution Guide Panel */}
            {showGuide && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 40
                        }}
                        onClick={() => setShowGuide(false)}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            backgroundColor: COLORS.bgCard,
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '24rem',
                            maxWidth: '100%',
                            zIndex: 50,
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            overflowY: 'auto'
                        }}
                    >
                        <button
                            onClick={() => setShowGuide(false)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                padding: '0.5rem',
                                borderRadius: '0.5rem',
                                backgroundColor: COLORS.bg,
                                border: 'none',
                                cursor: 'pointer',
                                zIndex: 10,
                                transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            ✕
                        </button>
                        <ContributionGuide />
                    </div>
                </>
            )}

            {/* Info Button */}
            <button
                onClick={() => setShowInfo(!showInfo)}
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    left: '1.5rem',
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.accentOrange,
                    cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                title="About"
            >
                <Info style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>

            {/* Info Modal */}
            {showInfo && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 40
                        }}
                        onClick={() => setShowInfo(false)}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            padding: '1.5rem',
                            borderRadius: '0.75rem',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            zIndex: 50,
                            maxWidth: '28rem',
                            backgroundColor: COLORS.bgCard,
                            border: `1px solid ${COLORS.border}`
                        }}
                    >
                        <button
                            onClick={() => setShowInfo(false)}
                            style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                background: 'none',
                                border: 'none',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                color: COLORS.fgMuted,
                                padding: '0.25rem',
                                lineHeight: 1
                            }}
                        >
                            ×
                        </button>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>About Qupacabras-DB</h3>
                        <div style={{ fontSize: '0.875rem', color: COLORS.fgMuted, lineHeight: 1.5 }}>
                            <p style={{ marginBottom: '0.5rem' }}>
                                {UI_CONSTANTS.appDescription}
                            </p>
                            <p style={{ marginBottom: '0.5rem' }}>
                                Built to help researchers compare quantum algorithm performance, analyze hardware capabilities, and track the evolution of quantum computing benchmarks over time.
                            </p>
                            <p style={{ marginBottom: '0.5rem' }}>
                                <strong style={{ color: COLORS.fg }}>Version:</strong> {UI_CONSTANTS.version}
                            </p>
                            <p style={{ marginBottom: '0.5rem' }}>
                                <strong style={{ color: COLORS.fg }}>GitHub:</strong>{' '}
                                <a
                                    href={CONFIG.githubRepoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: COLORS.accentBlue, textDecoration: 'none' }}
                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                    View Repository
                                </a>
                            </p>
                            <p style={{ marginBottom: '0.5rem' }}>
                                <strong style={{ color: COLORS.fg }}>Credits:</strong>
                            </p>
                            <ul style={{ paddingLeft: '1rem', marginBottom: '0.5rem' }}>
                                <li>Color theme inspired by{' '}
                                    <a
                                        href="https://github.com/morhetz/gruvbox"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: COLORS.accentBlue, textDecoration: 'none' }}
                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                    >
                                        Gruvbox
                                    </a>
                                </li>
                                <li>GIF generated with Veo 3.1</li>
                            </ul>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default App;