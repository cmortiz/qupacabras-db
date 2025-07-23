import React, { useState, useEffect, useMemo } from 'react';
import { COLORS, CONFIG, UI_CONSTANTS } from './constants';
import ContributionGuide from './components/ContributionGuide';
import BenchmarkTable from './components/BenchmarkTable';
import { useSortedData } from './hooks/useSortedData';
import { Info, Github } from 'lucide-react';

export default function App() {
    const [benchmarks, setBenchmarks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showGuide, setShowGuide] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // Simple text filtering
    const filteredBenchmarks = useMemo(() => {
        if (!searchQuery) {
            return benchmarks;
        }
        return benchmarks.filter(bm => {
            const query = searchQuery.toLowerCase();
            return (
                bm.algorithmName.toLowerCase().includes(query) ||
                (bm.device && bm.device.toLowerCase().includes(query)) ||
                bm.metricName.toLowerCase().includes(query) ||
                (bm.contributor && bm.contributor.toLowerCase().includes(query))
            );
        });
    }, [benchmarks, searchQuery]);

    // Sorting hook (applied to filtered data)
    const { sortedData, sortConfig, handleSort } = useSortedData(filteredBenchmarks);

    useEffect(() => {
        fetch(`${process.env.PUBLIC_URL}${CONFIG.benchmarksDataUrl}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load benchmark data');
                }
                return response.json();
            })
            .then(data => {
                const quantumData = data.map(d => ({
                    ...d,
                    timestamp: new Date(d.timestamp)
                }));
                
                const sortedData = quantumData.sort((a, b) => b.timestamp - a.timestamp);
                setBenchmarks(sortedData);
                setIsLoading(false);
            })
            .catch(error => {
                console.error('Error loading benchmark data:', error);
                setBenchmarks([]);
                setIsLoading(false);
            });
    }, []);

    const downloadCSV = () => {
        if (benchmarks.length === 0) {
            alert("No data available to download.");
            return;
        }
        const headers = [
            'Algorithm', 'Device', 'Metric', 'Value', 'Uncertainty',
            'Qubit_Error_Min', 'Qubit_Error_Max', 'Qubit_Error_Median', 'Qubit_Error_Mean',
            'Readout_Error_Min', 'Readout_Error_Max', 'Readout_Error_Median', 'Readout_Error_Mean',
            'Two_Qubit_Gate_Error_Min', 'Two_Qubit_Gate_Error_Max', 'Two_Qubit_Gate_Error_Median', 'Two_Qubit_Gate_Error_Mean',
            'Single_Qubit_Gate_Error_Min', 'Single_Qubit_Gate_Error_Max', 'Single_Qubit_Gate_Error_Median', 'Single_Qubit_Gate_Error_Mean',
            'Execution_Time_Min', 'Execution_Time_Max', 'Execution_Time_Median', 'Execution_Time_Mean', 'Execution_Time_Unit',
            'Paper_URL', 'Contributor', 'Contributor_URL', 'Timestamp', 'Submission_Folder_URL'
        ];
        
        const rows = benchmarks.map(bm => {
            const submissionUrl = `${CONFIG.githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`;
            const contributorUrl = bm.contributor ? `https://github.com/${bm.contributor}` : 'N/A';
            
            // Helper to extract stats or return N/A
            const getStats = (stats) => {
                if (!stats) return ['N/A', 'N/A', 'N/A', 'N/A'];
                return [stats.min, stats.max, stats.median, stats.mean];
            };
            
            return [
                `"${bm.algorithmName}"`, 
                `"${bm.device || 'N/A'}"`,
                `"${bm.metricName}"`, 
                bm.metricValue, 
                bm.uncertainty ?? 'N/A',
                ...getStats(bm.errorRates?.qubit),
                ...getStats(bm.errorRates?.readout),
                ...getStats(bm.errorRates?.twoQubitGate),
                ...getStats(bm.errorRates?.singleQubitGate),
                ...getStats(bm.executionTime),
                bm.executionTime?.unit || 'N/A',
                `"${bm.paperUrl || 'N/A'}"`,
                `"${bm.contributor || 'N/A'}"`,
                `"${contributorUrl}"`,
                `"${bm.timestamp.toISOString()}"`, 
                `"${submissionUrl}"`
            ].join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(',') + "\n" 
            + rows.join('\n');
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `quantum_benchmark_data_${new Date().toISOString().split('T')[0]}.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.bg, color: COLORS.fg }}>
            {/* Header with padding from top */}
            <header className="pt-8 pb-6 px-12">
                <div className="shadow-lg rounded-lg overflow-hidden" style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}>
                    <div className="px-8 py-6">
                        <div className="flex items-center gap-3">
                            <img src={UI_CONSTANTS.quantumIconUrl} alt="Quantum computer icon" className="w-8 h-8" />
                            <img src={UI_CONSTANTS.alienIconUrl} alt="Alien icon" className="w-8 h-8" />
                            <h1 className="text-2xl font-bold">
                                <span style={{color: COLORS.accentRed}}>Q</span>upacabras-DB
                            </h1>
                            <span className="hidden sm:inline text-sm" style={{ color: COLORS.fgMuted }}>
                                {UI_CONSTANTS.appDescription}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content area - full width */}
            <main className="px-12 pb-8">
                <BenchmarkTable 
                    filteredBenchmarks={sortedData}
                    isLoading={isLoading}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    downloadCSV={downloadCSV}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            </main>

            {/* Floating Action Button for Contribution Guide */}
            <button
                onClick={() => setShowGuide(!showGuide)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 z-50"
                style={{ 
                    backgroundColor: COLORS.accentBlue,
                    color: COLORS.bg
                }}
                title="How to Contribute"
            >
                <Github className="w-6 h-6" />
            </button>

            {/* Contribution Guide Panel */}
            {showGuide && (
                <>
                    <div 
                        className="fixed inset-0 bg-black bg-opacity-50 z-40"
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
                            className="absolute top-4 right-4 p-2 rounded-lg hover:opacity-80 z-10"
                            style={{ backgroundColor: COLORS.bg }}
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
                className="fixed bottom-6 left-6 w-10 h-10 rounded-full shadow-md flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{ 
                    backgroundColor: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.fgSubtle
                }}
                title="About"
            >
                <Info className="w-5 h-5" />
            </button>

            {/* Info Modal */}
            {showInfo && (
                <>
                    <div 
                        className="fixed inset-0 bg-black bg-opacity-50 z-40"
                        onClick={() => setShowInfo(false)}
                    />
                    <div 
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-6 rounded-xl shadow-xl z-50 max-w-md"
                        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
                    >
                        <button
                            onClick={() => setShowInfo(false)}
                            className="absolute top-4 right-4 p-2 rounded-lg hover:opacity-80"
                            style={{ backgroundColor: COLORS.bg }}
                        >
                            ✕
                        </button>
                        <h3 className="text-lg font-semibold mb-4">About Qupacabras-DB</h3>
                        <div className="space-y-2 text-sm" style={{ color: COLORS.fgMuted }}>
                            <p>Built with React and hosted on GitHub Pages.</p>
                            <p>Color Scheme: <a href="https://github.com/morhetz/gruvbox" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={{ color: COLORS.accentAqua }}>Gruvbox</a> by morhetz.</p>
                            <p>Icons: <a href="https://www.flaticon.com" title="Flaticon" className="underline hover:opacity-80" style={{ color: COLORS.accentAqua }}>Flaticon</a></p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

