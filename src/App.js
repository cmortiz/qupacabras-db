import React, { useState, useEffect, useMemo } from 'react';
import { COLORS, CONFIG, UI_CONSTANTS } from './constants';
import ContributionGuide from './components/ContributionGuide';
import BenchmarkTable from './components/BenchmarkTable';
import { useSortedData } from './hooks/useSortedData';

export default function App() {
    const [benchmarks, setBenchmarks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

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
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="text-center mb-8">
                    <div className="flex justify-center items-center gap-4">
                        <img src={UI_CONSTANTS.quantumIconUrl} alt="Quantum computer icon" className="w-10 h-10" />
                        <img src={UI_CONSTANTS.alienIconUrl} alt="Alien icon" className="w-10 h-10" />
                        <h1 className="text-4xl font-bold">
                            <span style={{color: COLORS.accentRed}}>Q</span>upacabras
                        </h1>
                    </div>
                    <p className="mt-2 text-lg" style={{ color: COLORS.fgMuted }}>
                        {UI_CONSTANTS.appDescription}
                    </p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <ContributionGuide />
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
                
                <footer className="text-center mt-10 text-sm" style={{ color: COLORS.fgSubtle }}>
                    <div className="pt-4 border-t" style={{borderColor: COLORS.border}}>
                        <p className="mb-2">Built with React and hosted on GitHub Pages.</p>
                        <p>Color Scheme: <a href="https://github.com/morhetz/gruvbox" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={{ color: COLORS.accentAqua }}>Gruvbox</a> by morhetz.</p>
                        <p className="mt-1">Icons: <a href="https://www.flaticon.com" title="Flaticon" className="underline hover:opacity-80" style={{ color: COLORS.accentAqua }}>Flaticon</a></p>
                    </div>
                </footer>
            </div>
        </div>
    );
}

