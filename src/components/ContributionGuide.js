import React from 'react';
import { Github } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';

export default function ContributionGuide() {
    return (
        <div className="lg:col-span-1">
            <div className="p-6 rounded-xl shadow-md sticky top-8" style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border, borderWidth: '1px' }}>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Github className="w-6 h-6" style={{ color: COLORS.accentAqua }} /> How to Contribute
                </h2>
                <p className="mb-4" style={{ color: COLORS.fgMuted }}>
                    This dataset is managed by the community. To add or update a benchmark, please submit a pull request on GitHub.
                </p>
                <ol className="list-decimal list-inside space-y-3" style={{ color: COLORS.fgMuted }}>
                    <li><strong>Fork</strong> the repository.</li>
                    <li><strong>Edit</strong> the data file to add your new entry.</li>
                    <li>Open a <strong>Pull Request</strong>.</li>
                    <li>Once approved, your changes will appear here automatically.</li>
                </ol>
                <a 
                    href={CONFIG.githubRepoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-6 w-full font-semibold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2" 
                    style={{ 
                        backgroundColor: COLORS.accentBlue, 
                        color: COLORS.bg, 
                        '--tw-ring-color': COLORS.accentAqua, 
                        'ringOffsetColor': COLORS.bgCard 
                    }}
                >
                    <Github className="w-5 h-5"/> Go to GitHub Repository
                </a>
            </div>
        </div>
    );
}