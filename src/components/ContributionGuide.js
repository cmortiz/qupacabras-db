import React from 'react';
import { Github } from 'lucide-react';
import { COLORS, CONFIG } from '../constants';

export default function ContributionGuide() {
    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <Github className="w-8 h-8" style={{ color: COLORS.accentAqua }} /> 
                Contribute
            </h2>
            
            {/* Quick Steps */}
            <div className="space-y-4 mb-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: COLORS.bg }}>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold" 
                             style={{ backgroundColor: COLORS.accentGreen, color: COLORS.bg }}>1</div>
                        <div>
                            <div className="font-semibold">Copy Template</div>
                            <div className="text-sm" style={{ color: COLORS.fgMuted }}>submissions/template → your_name</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: COLORS.bg }}>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold" 
                             style={{ backgroundColor: COLORS.accentRed, color: COLORS.bg }}>2</div>
                        <div>
                            <div className="font-semibold">Add Your Data</div>
                            <div className="text-sm" style={{ color: COLORS.fgMuted }}>Fill benchmark.json</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: COLORS.bg }}>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold" 
                             style={{ backgroundColor: COLORS.accentOrange, color: COLORS.bg }}>3</div>
                        <div>
                            <div className="font-semibold">Include QASM</div>
                            <div className="text-sm" style={{ color: COLORS.fgMuted }}>Add circuit files</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: COLORS.bg }}>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold" 
                             style={{ backgroundColor: COLORS.accentAqua, color: COLORS.bg }}>4</div>
                        <div>
                            <div className="font-semibold">Submit PR</div>
                            <div className="text-sm" style={{ color: COLORS.fgMuted }}>Create pull request</div>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-lg text-center" 
                     style={{ 
                         backgroundColor: COLORS.bg,
                         border: `2px dashed ${COLORS.accentGreen}` 
                     }}>
                    <div className="text-lg mb-1">✨</div>
                    <div className="font-medium">Auto-published after merge!</div>
                </div>
            </div>

            {/* Compact Info Box */}
            <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: COLORS.bg }}>
                <div className="font-medium mb-2">Required fields:</div>
                <div className="text-sm" style={{ color: COLORS.fgMuted }}>
                    id • algorithm • device • metric • timestamp
                </div>
            </div>

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