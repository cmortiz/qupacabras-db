import React, { useState } from 'react';
import { Github } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';

export default function ContributionGuide() {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div className="p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Github className="w-6 h-6" style={{ color: COLORS.accentAqua }} /> 
                How to Contribute
            </h2>
            
            {/* Quick Steps */}
            <div className="space-y-4 mb-6">
                <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                        <span className="font-bold" style={{ color: COLORS.accentGreen }}>1.</span>
                        <div>
                            <strong>Copy</strong> submissions/template/ → submissions/your_name/
                        </div>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold" style={{ color: COLORS.accentGreen }}>2.</span>
                        <div>
                            <strong>Fill</strong> benchmark.json with your data
                            <span className="text-xs block" style={{ color: COLORS.accentOrange }}>
                                ID must match folder name
                            </span>
                        </div>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold" style={{ color: COLORS.accentGreen }}>3.</span>
                        <strong>Add</strong> your QASM files
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold" style={{ color: COLORS.accentGreen }}>4.</span>
                        <strong>Submit</strong> a Pull Request
                    </li>
                </ol>

                <div className="text-sm p-3 rounded-lg" 
                     style={{ 
                         backgroundColor: `${COLORS.accentGreen}20`, 
                         border: `1px solid ${COLORS.accentGreen}40` 
                     }}>
                    ✨ Your data appears automatically after merge!
                </div>
            </div>

            {/* Minimal Required Fields */}
            <div className="mb-6">
                <h3 className="font-semibold mb-2 text-sm">Required Fields:</h3>
                <div className="text-xs space-y-1" style={{ color: COLORS.fgMuted }}>
                    <div>• <strong>id</strong>, <strong>algorithmName</strong>, <strong>device</strong></div>
                    <div>• <strong>metricName</strong> & <strong>metricValue</strong> (0-1 for rates)</div>
                    <div>• <strong>timestamp</strong> (ISO: 2024-01-15T10:30:00Z)</div>
                </div>
            </div>

            {/* Show More Details */}
            <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm mb-4 hover:opacity-80"
                style={{ color: COLORS.accentAqua }}
            >
                {showDetails ? '− Hide' : '+ Show'} Details
            </button>

            {showDetails && (
                <div className="space-y-4 mb-6 text-xs" style={{ color: COLORS.fgMuted }}>
                    <div>
                        <strong>Optional:</strong> error stats, team, paper URL, quantum properties
                    </div>
                    <div>
                        <strong>Validation:</strong> Automatic checks for schema, ID match, file existence
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
                <a 
                    href={`${CONFIG.githubRepoUrl}/tree/main/submissions/template`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-4 rounded-lg text-sm transition-colors duration-200 flex items-center justify-center gap-2"
                    style={{ 
                        backgroundColor: COLORS.bg,
                        border: `1px solid ${COLORS.accentAqua}`,
                        color: COLORS.accentAqua
                    }}
                >
                    📁 View Template
                </a>
                <a 
                    href={CONFIG.githubRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-lg font-semibold transition-colors duration-200 flex items-center justify-center gap-2"
                    style={{ 
                        backgroundColor: COLORS.accentBlue,
                        color: COLORS.bg
                    }}
                >
                    <Github className="w-5 h-5" />
                    Go to Repository
                </a>
            </div>
        </div>
    );
}