import React from 'react';
import { Github } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';

export default function ContributionGuide() {
    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <Github className="w-8 h-8" style={{ color: COLORS.accentAqua }} /> 
                How to Contribute
            </h2>
            
            {/* Simple Bulleted List */}
            <div className="space-y-4 mb-8">
                <ul className="space-y-3 text-base" style={{ color: COLORS.fg }}>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Fork the repository and create a new branch</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Copy the template folder from submissions/template</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Fill in your benchmark data in benchmark.json</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Add your quantum circuit files (.qasm)</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Submit a pull request to the main branch</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.accentGreen }}>•</span>
                        <span>Your benchmark will be published after review</span>
                    </li>
                </ul>
            </div>

            {/* Link to Full Guide */}
            <div className="mt-8">
                <a 
                    href="https://github.com/cmortiz/qupacabras-db/blob/main/CONTRIBUTING.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-lg font-semibold transition-colors duration-200 flex items-center justify-center gap-2"
                    style={{ 
                        backgroundColor: COLORS.accentBlue,
                        color: COLORS.bg
                    }}
                >
                    <Github className="w-5 h-5" />
                    View Full Contributing Guide
                </a>
            </div>
        </div>
    );
}