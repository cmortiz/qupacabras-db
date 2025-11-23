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
            
            {/* No Coding Required */}
            <div style={{
                backgroundColor: COLORS.bg0Hard,
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                border: `2px solid ${COLORS.accentGreen}`
            }}>
                <p style={{
                    color: COLORS.accentGreen,
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    fontSize: '1.1rem'
                }}>
                    No coding required!
                </p>
                <p style={{ color: COLORS.fg }}>
                    Submit a benchmark directly from your browser
                </p>
            </div>

            {/* Submission Steps */}
            <div style={{ marginBottom: '2rem' }}>
                <ol style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    marginBottom: '1.5rem',
                    color: COLORS.fg
                }}>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>1.</span>
                        <span>
                            Go to the{' '}
                            <a
                                href="https://github.com/cmortiz/qupacabras-db/issues/new/choose"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: COLORS.accentBlue, textDecoration: 'underline' }}
                            >
                                Issues tab
                            </a>
                        </span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>2.</span>
                        <span>Click "Get started" next to "Benchmark Submission"</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>3.</span>
                        <span>Fill out the form with your experiment details</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>4.</span>
                        <span>Click "Submit new issue"</span>
                    </li>
                </ol>

                <div style={{
                    backgroundColor: COLORS.bg0Hard,
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    borderLeft: `4px solid ${COLORS.accentAqua}`
                }}>
                    <p style={{ color: COLORS.accentAqua, fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        That's it! Our bot will automatically:
                    </p>
                    <ul style={{ color: COLORS.fg, paddingLeft: '1.5rem', margin: 0 }}>
                        <li>Create a Pull Request for you</li>
                        <li>Validate your data</li>
                        <li>Notify you when it's merged</li>
                    </ul>
                </div>
            </div>

            {/* Updating Section */}
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    color: COLORS.accentYellow,
                    marginBottom: '1rem'
                }}>
                    Updating Your Submission
                </h3>
                <p style={{ color: COLORS.fg, marginBottom: '0.75rem' }}>
                    Need to fix a typo or update your results?
                </p>
                <ol style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    marginBottom: '0.75rem',
                    color: COLORS.fg
                }}>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>1.</span>
                        <span>Go back to your original Issue</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>2.</span>
                        <span>Click Edit on the top comment</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>3.</span>
                        <span>Update the form values</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ fontWeight: '600', color: COLORS.accentGreen }}>4.</span>
                        <span>Click Update comment</span>
                    </li>
                </ol>
                <p style={{ color: COLORS.accentAqua, fontStyle: 'italic' }}>
                    The bot will automatically update your existing Pull Request!
                </p>
            </div>

            {/* Validation Info */}
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    color: COLORS.accentPurple,
                    marginBottom: '0.75rem'
                }}>
                    Validation
                </h3>
                <p style={{ color: COLORS.fg, marginBottom: '0.5rem' }}>
                    All submissions are automatically validated for:
                </p>
                <ul style={{ color: COLORS.fg, paddingLeft: '1.5rem' }}>
                    <li>JSON Schema compliance</li>
                    <li>Required fields</li>
                    <li>Numeric ranges</li>
                    <li>Duplicate detection</li>
                </ul>
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