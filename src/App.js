// --- IMPORTS ---
// We import React and its hooks (useState, useEffect, useMemo) for managing component state and side effects.
// We also import icons from the 'lucide-react' library for a clean user interface.
import React, { useState, useEffect, useMemo } from 'react';
import { FileDown, Database, Github, FileArchive, Search, FileText, ScrollText } from 'lucide-react';

// --- AUTOMATIC BENCHMARK DATA LOADING ---
// Benchmark data is now automatically loaded from submissions/ folder
// The build process scans all submissions and generates public/benchmarks.json
// No manual editing required - just add your submission folder and submit a PR!

// --- MAIN APP COMPONENT ---
// This is the main function that builds and manages the entire webpage.
export default function App() {
    // --- STATE MANAGEMENT ---
    // 'useState' is a React hook for storing data that can change over time.
    const [benchmarks, setBenchmarks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    // New state for storing the user's search query.
    const [searchQuery, setSearchQuery] = useState('');
    
    // --- REPO URL CONFIGURATION ---
    // IMPORTANT: Replace this with your actual GitHub repository URL.
    const githubRepoUrl = 'https://github.com/YOUR_USERNAME/qupacabras';

    // --- DATA LOADING EFFECT ---
    // 'useEffect' is a React hook for running side effects (like data fetching).
    // The empty array `[]` at the end means this code will run only ONCE, when the component first loads.
    useEffect(() => {
        // Fetch benchmark data from the automatically generated JSON file
        fetch(`${process.env.PUBLIC_URL}/benchmarks.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load benchmark data');
                }
                return response.json();
            })
            .then(data => {
                // Convert the date strings into actual JavaScript Date objects
                const quantumData = data.map(d => ({
                    ...d,
                    timestamp: new Date(d.timestamp)
                }));
                
                // Data is already sorted by the generation script, but we can sort again for safety
                const sortedData = quantumData.sort((a, b) => b.timestamp - a.timestamp);
                
                // Update the 'benchmarks' state with our processed and sorted data
                setBenchmarks(sortedData);
                setIsLoading(false);
            })
            .catch(error => {
                console.error('Error loading benchmark data:', error);
                // If loading fails, show an empty state but don't leave the user hanging
                setBenchmarks([]);
                setIsLoading(false);
            });
    }, []);
    
    // --- FILTERED DATA ---
    // 'useMemo' is a performance optimization hook. It ensures the filtering logic
    // only re-runs when the 'benchmarks' data or the 'searchQuery' changes.
    const filteredBenchmarks = useMemo(() => {
        // If the search query is empty, return all benchmarks.
        if (!searchQuery) {
            return benchmarks;
        }
        // Otherwise, filter the benchmarks array.
        return benchmarks.filter(bm => {
            const query = searchQuery.toLowerCase();
            // Return true if the query is found in the algorithm name, device, metric name, or team.
            return (
                bm.algorithmName.toLowerCase().includes(query) ||
                (bm.device && bm.device.toLowerCase().includes(query)) ||
                bm.metricName.toLowerCase().includes(query) ||
                (bm.team && bm.team.join(', ').toLowerCase().includes(query))
            );
        });
    }, [benchmarks, searchQuery]); // Dependencies: re-run when these values change.

    // --- CSV DOWNLOAD HANDLER ---
    // This function is called when the "Download CSV" button is clicked.
    const downloadCSV = () => {
        // First, check if there's any data to download.
        if (benchmarks.length === 0) {
            alert("No data available to download.");
            return;
        }
        // Define the column headers for the CSV file.
        const headers = ['Algorithm', 'Team', 'Device', 'Metric', 'Value', 'Uncertainty', 'Paper_URL', 'Timestamp', 'Submission_Folder_URL'];
        
        // Convert each benchmark object into a single line of comma-separated values.
        const rows = benchmarks.map(bm => {
            // CONSTRUCTING THE FULL URL:
            const submissionUrl = `${githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`;
            
            // Return an array of values for the current row, ensuring strings are quoted.
            return [
                `"${bm.algorithmName}"`, 
                `"${bm.team ? bm.team.join('; ') : 'N/A'}"`,
                `"${bm.device || 'N/A'}"`,
                `"${bm.metricName}"`, 
                bm.metricValue, 
                bm.uncertainty ?? 'N/A', // Add uncertainty, using 'N/A' if null/undefined
                `"${bm.paperUrl || 'N/A'}"`,
                `"${bm.timestamp.toISOString()}"`, 
                `"${submissionUrl}"`
            ].join(','); // Join the array elements into a single string with commas.
        });

        // Combine the headers and all the rows into the final CSV content.
        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(',') + "\n" 
            + rows.join('\n');
            
        // THE "INVISIBLE LINK" TRICK FOR DOWNLOADING:
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `quantum_benchmark_data_${new Date().toISOString().split('T')[0]}.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- RENDER LOGIC ---
    // To keep styling clean, we define the Gruvbox color palette here as a single object.
    const colors = {
        bg: '#282828', bgCard: '#3c3836', border: '#504945', fg: '#ebdbb2', fgMuted: '#d5c4a1',
        fgSubtle: '#a89984', accentAqua: '#8ec07c', accentRed: '#cc241d', accentOrange: '#d65d0e', accentBlue: '#83a598', accentGreen: '#b8bb26'
    };

    return (
        // Root container with background color and default text color.
        <div className="min-h-screen font-sans" style={{ backgroundColor: colors.bg, color: colors.fg }}>
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                
                {/* Page Header */}
                <header className="text-center mb-8">
                    <div className="flex justify-center items-center gap-4">
                        <img src="https://cdn-icons-png.flaticon.com/512/2628/2628521.png" alt="Quantum computer icon" className="w-10 h-10" />
                        <img src="https://cdn-icons-png.flaticon.com/512/1970/1970363.png" alt="Alien icon" className="w-10 h-10" />
                        <h1 className="text-4xl font-bold">
                            <span style={{color: colors.accentRed}}>Q</span>upacabras
                        </h1>
                    </div>
                    <p className="mt-2 text-lg" style={{ color: colors.fgMuted }}>A community-maintained database for tracking the performance of quantum algorithms executed on quantum devices.</p>
                </header>

                {/* Main Content Area (2-column layout on large screens) */}
                <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Contribution Instructions */}
                    <div className="lg:col-span-1">
                        <div className="p-6 rounded-xl shadow-md sticky top-8" style={{ backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: '1px' }}>
                            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2"><Github className="w-6 h-6" style={{ color: colors.accentAqua }} /> How to Contribute</h2>
                            <p className="mb-4" style={{ color: colors.fgMuted }}>This dataset is managed by the community. To add or update a benchmark, please submit a pull request on GitHub.</p>
                            <ol className="list-decimal list-inside space-y-3" style={{ color: colors.fgMuted }}>
                                <li><strong>Fork</strong> the repository.</li>
                                <li><strong>Edit</strong> the data file to add your new entry.</li>
                                <li>Open a <strong>Pull Request</strong>.</li>
                                <li>Once approved, your changes will appear here automatically.</li>
                            </ol>
                            <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="mt-6 w-full font-semibold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2" style={{ backgroundColor: colors.accentBlue, color: colors.bg, '--tw-ring-color': colors.accentAqua, 'ringOffsetColor': colors.bgCard }}>
                                <Github className="w-5 h-5"/> Go to GitHub Repository
                            </a>
                        </div>
                    </div>

                    {/* Right Column: Data Table */}
                    <div className="lg:col-span-2">
                        <div className="p-6 rounded-xl shadow-md" style={{ backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: '1px' }}>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                                <h2 className="text-2xl font-semibold flex items-center gap-2">
                                    <Database className="w-6 h-6" style={{ color: colors.accentAqua }} /> Benchmark Data
                                </h2>
                                <div className="flex-grow max-w-sm w-full">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.fgSubtle }} />
                                        <input
                                            type="text"
                                            placeholder="Search benchmarks..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
                                            style={{ 
                                                backgroundColor: colors.bg, 
                                                borderColor: colors.border, 
                                                color: colors.fg 
                                            }}
                                        />
                                    </div>
                                </div>
                                <button onClick={downloadCSV} className="font-semibold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2 text-sm" style={{ backgroundColor: colors.accentGreen, color: colors.bg, '--tw-ring-color': colors.accentGreen, 'ringOffsetColor': colors.bgCard }}>
                                    <FileDown className="w-4 h-4"/> Download CSV
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left table-auto">
                                    {/* Table Header */}
                                    <thead style={{ borderBottomColor: colors.border, borderBottomWidth: '2px' }}>
                                        <tr className="text-sm font-semibold" style={{ color: colors.fgMuted }}>
                                            <th className="p-3">Algorithm</th>
                                            <th className="p-3">Team</th>
                                            <th className="p-3">Device</th>
                                            <th className="p-3">Metric</th>
                                            <th className="p-3 text-right">Value</th>
                                            <th className="p-3 text-right">Uncertainty</th>
                                            <th className="p-3 text-center">Paper</th>
                                            <th className="p-3 text-center">Files</th>
                                            <th className="p-3">Timestamp</th>
                                        </tr>
                                    </thead>
                                    {/* Table Body */}
                                    <tbody>
                                        {/* Conditional Rendering: Show a "Loading..." message or the data table */}
                                        {isLoading ? (<tr><td colSpan="8" className="text-center p-8" style={{ color: colors.fgMuted }}>Loading...</td></tr>) 
                                        : filteredBenchmarks.length > 0 ? (
                                            // The .map() function iterates over our 'filteredBenchmarks' state and creates a table row <tr> for each item.
                                            filteredBenchmarks.map(bm => (
                                                <tr key={bm.id} className="hover:bg-[#504945]" style={{ borderBottomColor: colors.border, borderBottomWidth: '1px' }}>
                                                    <td className="p-3 font-medium">{bm.algorithmName}</td>
                                                    <td className="p-3 text-sm" style={{ color: colors.fgSubtle }}>{bm.team ? bm.team.join(', ') : 'N/A'}</td>
                                                    <td className="p-3" style={{ color: colors.fgMuted }}>{bm.device}</td>
                                                    <td className="p-3" style={{ color: colors.fgMuted }}>{bm.metricName}</td>
                                                    <td className="p-3 text-right font-mono" style={{ color: colors.accentOrange }}>{bm.metricValue}</td>
                                                    <td className="p-3 text-right font-mono" style={{ color: colors.fgSubtle }}>
                                                        {bm.uncertainty != null ? `±${bm.uncertainty}` : 'N/A'}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {bm.paperUrl ? (
                                                            <a href={bm.paperUrl} target="_blank" rel="noopener noreferrer" title="View Paper" className="inline-block p-1 rounded-full hover:opacity-80 transition-opacity" style={{ color: colors.accentAqua }}>
                                                                <ScrollText className="w-5 h-5"/>
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: colors.border }}>-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {/* This link points to the benchmark folder on GitHub containing all files */}
                                                        <a href={`${githubRepoUrl}/tree/main/submissions/${bm.benchmarkFolder}`} target="_blank" rel="noopener noreferrer" title="View all files" className="inline-block p-1 rounded-full hover:opacity-80 transition-opacity" style={{ color: colors.accentAqua }}>
                                                            <FileText className="w-5 h-5"/>
                                                        </a>
                                                    </td>
                                                    <td className="p-3 text-sm" style={{ color: colors.fgSubtle }}>{bm.timestamp.toLocaleDateString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            // This row is displayed if the search query yields no results.
                                            <tr>
                                                <td colSpan="8" className="text-center p-8" style={{ color: colors.fgMuted }}>
                                                    No results found for "{searchQuery}".
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </main>
                
                {/* Page Footer */}
                <footer className="text-center mt-10 text-sm" style={{ color: colors.fgSubtle }}>
                    <div className="pt-4 border-t" style={{borderColor: colors.border}}>
                        <p className="mb-2">Built with React and hosted on GitHub Pages.</p>
                        <p>Color Scheme: <a href="https://github.com/morhetz/gruvbox" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={{ color: colors.accentAqua }}>Gruvbox</a> by morhetz.</p>
                        <p className="mt-1">Icons: <a href="https://www.flaticon.com" title="Flaticon" className="underline hover:opacity-80" style={{ color: colors.accentAqua }}>Flaticon</a></p>
                    </div>
                </footer>
            </div>
        </div>
    );
}

