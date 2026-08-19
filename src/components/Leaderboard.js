import React from 'react';
import { Trophy, ArrowUp, Minus } from 'lucide-react';
import { COLORS } from '../constants';

/**
 * Ranked standings of verified nonlocal-game results.
 *
 * Two rules govern this view:
 *
 * 1. Only entries whose build-time verification produced `verification.ranked === true` appear.
 *    An entry that failed verification, was never verified, or carries no verification block is
 *    not ranked and is not shown here. It still appears in the benchmark table below.
 * 2. Every number shown is the recomputed one. The submitted `metricValue` and
 *    `nonlocalGame.winRate` are claims; `verification.winRate.recomputedMean` is what the counts
 *    actually give, and recomputing is the point of the feature.
 *
 * The event layer is a thin veneer here: `nonlocalGame.eventTeam` is optional and the component
 * falls back to `team[]` and then `contributor`, so deleting the event fields leaves this working.
 */

// The significance figure is deliberately not called "sigma" in the interface. It is a
// Gaussian-equivalent z-score, a different quantity from the Bernstein tail bound reported next
// to it, and labelling either as a plain standard error would overstate the result.
const SIGNIFICANCE_TOOLTIP =
    'Gaussian-equivalent z-score: (recomputed win rate minus classical value) divided by the ' +
    'binomial standard error of the pooled rate, under a null of independent Bernoulli rounds. ' +
    'It is a different quantity from the Bernstein bound reported below it.';

const BERNSTEIN_TOOLTIP =
    'Two tail bounds on the chance that a classical strategy reaches this win rate. The Bernstein ' +
    'value is the historical figure, kept for comparability with the published corpus; the exact ' +
    'binomial tail is the sharper, exactly valid bound. Both are upper bounds, and both are ' +
    'different quantities from the z-score beside them.';

const WIN_RATE_TOOLTIP =
    'Win rate recomputed at build time from the submitted per-question measurement counts, not the ' +
    'value the submission claimed.';

/**
 * @param {Object} benchmark - Index entry.
 * @returns {boolean} Whether the build-time verification ranked this entry.
 */
function isRanked(benchmark) {
    return benchmark?.verification?.ranked === true;
}

/**
 * @param {Object} benchmark - Index entry.
 * @returns {number|null} Recomputed win rate, or null when it is missing or not finite.
 */
function recomputedRate(benchmark) {
    const value = benchmark?.verification?.winRate?.recomputedMean;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Event team name if one was supplied, otherwise the contributing people.
 *
 * @param {Object} benchmark - Index entry.
 * @returns {string} Display name for the standings row.
 */
function attribution(benchmark) {
    const eventTeam = benchmark.nonlocalGame?.eventTeam ?? benchmark.eventTeam;
    if (typeof eventTeam === 'string' && eventTeam.trim() !== '') {
        return eventTeam.trim();
    }
    if (Array.isArray(benchmark.team) && benchmark.team.length > 0) {
        return benchmark.team.join(', ');
    }
    if (typeof benchmark.contributor === 'string' && benchmark.contributor.trim() !== '') {
        return benchmark.contributor.trim();
    }
    return 'Unattributed';
}

/**
 * @param {Object} benchmark - Index entry.
 * @returns {string} Human-readable game label from the resolved game, with plain fallbacks.
 */
function gameLabel(benchmark) {
    const game = benchmark.verification?.game;
    return game?.label || game?.id || benchmark.nonlocalGame?.game || '-';
}

/**
 * @param {*} value - Candidate number.
 * @returns {string} Four-decimal form, or 'N/A' when there is no finite number to show.
 */
function formatRate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return value.toFixed(4);
}

/**
 * @param {*} value - Candidate number.
 * @returns {string} Signed four-decimal form, or 'N/A'.
 */
function formatMargin(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return (value >= 0 ? '+' : '') + value.toFixed(4);
}

/**
 * @param {*} value - Candidate number.
 * @returns {string} Small magnitudes in exponential form, everything else to four decimals.
 */
function formatSmall(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    if (value !== 0 && Math.abs(value) < 1e-4) return value.toExponential(2);
    return value.toFixed(4);
}

/**
 * @param {*} value - Candidate number.
 * @returns {string} Two-decimal form, or 'N/A'.
 */
function formatZ(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return value.toFixed(2);
}

export default function Leaderboard({ benchmarks = [], isLoading = false }) {
    // Sorted here with an explicit numeric comparator rather than through useSortedData: that
    // hook only coerces with parseFloat for a short list of key names, and
    // 'verification.winRate.recomputedMean' matches none of them, so a value that arrived as a
    // string would be compared lexicographically.
    const ranked = benchmarks
        .filter(isRanked)
        .slice()
        .sort((a, b) => {
            const aRate = recomputedRate(a);
            const bRate = recomputedRate(b);
            return (bRate === null ? -Infinity : bRate) - (aRate === null ? -Infinity : aRate);
        });

    const headerCell = { padding: '0.75rem 1.5rem', color: COLORS.fgMuted, fontWeight: '600' };
    const bodyCell = { padding: '0.75rem 1.5rem' };

    return (
        <div style={{ width: '100%', marginTop: '2rem' }}>
            <div style={{
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`
            }}>
                <div style={{ padding: '1.5rem 2rem', borderBottom: `1px solid ${COLORS.border}` }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Trophy style={{ width: '1.5rem', height: '1.5rem', color: COLORS.accentOrange }} /> Verified Standings
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: COLORS.fgMuted, margin: '0.5rem 0 0 0', lineHeight: 1.5 }}>
                        Nonlocal-game results ranked by the win rate recomputed from their measurement counts at build
                        time. An entry appears here only if that recomputation succeeded and every check passed.
                    </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', tableLayout: 'auto' }}>
                        <thead style={{ borderBottom: `2px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}>
                            <tr>
                                <th style={{ ...headerCell, textAlign: 'center' }}>Rank</th>
                                <th style={headerCell}>Team</th>
                                <th style={headerCell}>Device</th>
                                <th style={headerCell}>Game</th>
                                <th style={{ ...headerCell, textAlign: 'right' }} title={WIN_RATE_TOOLTIP}>
                                    Win rate (recomputed)
                                </th>
                                <th style={headerCell}>Classical value</th>
                                <th style={{ ...headerCell, textAlign: 'right' }} title={SIGNIFICANCE_TOOLTIP}>
                                    Significance
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: COLORS.fgMuted }}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : ranked.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: COLORS.fgMuted }}>
                                        <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: COLORS.fg }}>
                                            No verified results yet.
                                        </div>
                                        <div style={{ fontSize: '0.875rem' }}>
                                            A submission is ranked once it ships the per-question measurement counts behind
                                            its win rate and the recomputation of that win rate passes every check.
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                ranked.map((bm, index) => {
                                    const verification = bm.verification;
                                    const rate = recomputedRate(bm);
                                    const classical = verification.classical || {};
                                    const uncertainty = verification.uncertainty || {};
                                    const exceeded = classical.exceeded === true;
                                    const margin = typeof classical.value === 'number' && rate !== null
                                        ? rate - classical.value
                                        : null;

                                    return (
                                        <tr key={bm.id ?? index} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                            <td style={{ ...bodyCell, textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', color: COLORS.fgMuted }}>
                                                {index + 1}
                                            </td>
                                            <td style={{ ...bodyCell, fontWeight: '500' }}>{attribution(bm)}</td>
                                            <td style={{ ...bodyCell, color: COLORS.fgMuted }}>{bm.device || 'N/A'}</td>
                                            <td style={{ ...bodyCell, color: COLORS.fgMuted }}>{gameLabel(bm)}</td>
                                            <td style={{ ...bodyCell, textAlign: 'right' }}>
                                                <span
                                                    style={{ fontFamily: 'monospace', color: COLORS.accentOrange, fontWeight: 'bold', fontSize: '1.125rem' }}
                                                    title={WIN_RATE_TOOLTIP}
                                                >
                                                    {formatRate(rate)}
                                                </span>
                                                {typeof uncertainty.recomputed === 'number' && (
                                                    <span style={{ fontSize: '0.875rem', color: COLORS.fgMuted, marginLeft: '0.25rem' }}>
                                                        ±{formatSmall(uncertainty.recomputed)}
                                                        {uncertainty.approximate === true ? ' (approximate)' : ''}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={bodyCell}>
                                                <div style={{ fontFamily: 'monospace', color: COLORS.fg }}>
                                                    {formatRate(classical.value)}
                                                    <span style={{ color: COLORS.fgMuted, marginLeft: '0.5rem' }}>
                                                        ({formatMargin(margin)})
                                                    </span>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    marginTop: '0.25rem',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    color: exceeded ? COLORS.accentGreen : COLORS.fgSubtle
                                                }}>
                                                    {exceeded
                                                        ? <ArrowUp style={{ width: '0.9rem', height: '0.9rem' }} />
                                                        : <Minus style={{ width: '0.9rem', height: '0.9rem' }} />}
                                                    {exceeded ? 'Above classical bound' : 'At or below classical bound'}
                                                </div>
                                            </td>
                                            <td style={{ ...bodyCell, textAlign: 'right' }}>
                                                <div style={{ fontFamily: 'monospace', color: COLORS.fg }} title={SIGNIFICANCE_TOOLTIP}>
                                                    {formatZ(classical.sigma)} z
                                                </div>
                                                <div
                                                    style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}
                                                    title={BERNSTEIN_TOOLTIP}
                                                >
                                                    Bernstein bound {formatSmall(classical.pValue)}
                                                </div>
                                                <div
                                                    style={{ fontSize: '0.75rem', color: COLORS.fgSubtle, marginTop: '0.25rem' }}
                                                    title={BERNSTEIN_TOOLTIP}
                                                >
                                                    Exact binomial {formatSmall(classical.pValueExact)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
