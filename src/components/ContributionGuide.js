import React from 'react';
import { Github } from 'lucide-react';
import { COLORS } from '../constants';

export default function ContributionGuide() {
    return (
        <div style={{ padding: '1.5rem' }}>
            <h2 style={{ 
                fontSize: '1.875rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '60px'
            }}>
                <Github style={{ width: '2rem', height: '2rem', color: COLORS.accentAqua }} /> 
                How to Contribute
            </h2>
            
            {/* Enumerated List */}
            <div style={{ marginBottom: '2rem' }}>
                <ol style={{ 
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    color: COLORS.fg 
                }}>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>1.</span>
                        <span>Fork the repository and create a new branch</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>2.</span>
                        <span>Copy the template folder from submissions/template</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>3.</span>
                        <span>Fill in your benchmark data in benchmark.json</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>4.</span>
                        <span>Add your quantum circuit files (.qasm)</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>5.</span>
                        <span>Submit a pull request to the main branch</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>6.</span>
                        <span>Your benchmark will be published after review</span>
                    </li>
                </ol>
            </div>

            {/* Link to Repository */}
            <div style={{ marginTop: '2rem' }}>
                <a 
                    href="https://github.com/cmortiz/qupacabras-db"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        backgroundColor: COLORS.accentBlue,
                        color: COLORS.bg,
                        textDecoration: 'none',
                        transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    <Github style={{ width: '1.25rem', height: '1.25rem' }} />
                    Go to Repository
                </a>
            </div>
        </div>
    );
}