import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Leaderboard from '../Leaderboard';

// A minimal ranked entry: only the fields the leaderboard reads. `overrides` is merged shallowly
// so a test can vary one thing at a time.
function makeEntry(id, recomputedMean, overrides = {}) {
  return {
    id,
    device: 'Test Device',
    contributor: `${id}-contributor`,
    metricValue: 0.5,
    nonlocalGame: { game: 'odd-cycle', params: { n: 3 }, winRate: 0.5, countsFile: 'counts.json' },
    verification: {
      verifierVersion: 1,
      status: 'verified',
      ranked: true,
      game: { id: 'odd-cycle:n=3', name: 'odd-cycle', label: 'Odd cycle C_3' },
      winRate: { claimed: recomputedMean, recomputedMean, totalShots: 6144, questions: 6 },
      uncertainty: { claimed: 0.016, recomputed: 0.016, approximate: false },
      classical: { value: 0.8333333333333334, exceeded: false, sigma: -1.5, pValue: 1 },
      checks: []
    },
    ...overrides
  };
}

// Everything after the header row.
function dataRows() {
  return screen.getAllByRole('row').slice(1);
}

describe('Leaderboard', () => {
  test('ranks only entries whose verification set ranked === true', () => {
    const failed = makeEntry('failed-entry', 0.99);
    failed.verification.status = 'failed';
    failed.verification.ranked = false;

    const unverified = makeEntry('unverified-entry', 0.98);
    unverified.verification.status = 'unverified';
    unverified.verification.ranked = false;

    const noBlock = makeEntry('no-verification-entry', 0.97);
    delete noBlock.verification;

    const ranked = makeEntry('ranked-entry', 0.5);

    render(<Leaderboard benchmarks={[failed, unverified, noBlock, ranked]} />);

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText('ranked-entry-contributor')).toBeInTheDocument();
    expect(screen.queryByText('failed-entry-contributor')).not.toBeInTheDocument();
    expect(screen.queryByText('unverified-entry-contributor')).not.toBeInTheDocument();
    expect(screen.queryByText('no-verification-entry-contributor')).not.toBeInTheDocument();
  });

  test('orders by recomputed win rate descending, numerically', () => {
    // 0.9, 0.85 and 0.1 are the case that a lexicographic sort gets wrong once the values arrive
    // as strings, so this pins the comparator to numeric ordering.
    const entries = [
      makeEntry('low', 0.1, { contributor: 'Low' }),
      makeEntry('high', 0.9, { contributor: 'High' }),
      makeEntry('middle', 0.85, { contributor: 'Middle' })
    ];

    render(<Leaderboard benchmarks={entries} />);

    const rows = dataRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('High')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0.9000')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Middle')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('0.8500')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Low')).toBeInTheDocument();
    expect(within(rows[2]).getByText('3')).toBeInTheDocument();
    expect(within(rows[2]).getByText('0.1000')).toBeInTheDocument();
  });

  test('shows the recomputed win rate, not the submitted claim', () => {
    const entry = makeEntry('drifted', 0.9358823529411765);
    entry.metricValue = 0.94;
    entry.nonlocalGame.winRate = 0.94;
    entry.verification.winRate.claimed = 0.94;

    render(<Leaderboard benchmarks={[entry]} />);

    expect(screen.getByText('0.9359')).toBeInTheDocument();
    expect(screen.queryByText('0.94')).not.toBeInTheDocument();
    expect(screen.queryByText('0.9400')).not.toBeInTheDocument();
  });

  test('distinguishes a result above the classical bound from one that is not', () => {
    const above = makeEntry('above', 0.9793, { contributor: 'Above' });
    above.verification.classical = {
      value: 0.9772727272727273,
      exceeded: true,
      sigma: 3.42,
      pValue: 0.04675268138851943
    };

    const notAbove = makeEntry('not-above', 0.9601, { contributor: 'NotAbove' });
    notAbove.verification.classical = {
      value: 0.9772727272727273,
      exceeded: false,
      sigma: -2.11,
      pValue: 1
    };

    render(<Leaderboard benchmarks={[above, notAbove]} />);

    const rows = dataRows();
    expect(within(rows[0]).getByText('Above classical bound')).toBeInTheDocument();
    expect(within(rows[0]).getByText('(+0.0020)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('3.42 z')).toBeInTheDocument();
    expect(within(rows[1]).getByText('At or below classical bound')).toBeInTheDocument();
    expect(within(rows[1]).getByText('(-0.0172)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('-2.11 z')).toBeInTheDocument();
  });

  test('labels the significance figure without calling it a standard error', () => {
    const entry = makeEntry('sig', 0.9793);
    entry.verification.classical = { value: 0.9772727272727273, exceeded: true, sigma: 3.42, pValue: 0.0467 };

    render(<Leaderboard benchmarks={[entry]} />);

    const header = screen.getByText('Significance');
    expect(header).toBeInTheDocument();
    expect(header.getAttribute('title')).toMatch(/Gaussian-equivalent z-score/);
    expect(screen.getByText(/Bernstein bound/)).toBeInTheDocument();
    expect(screen.queryByText(/sigma/i)).not.toBeInTheDocument();
    expect(screen.queryByText('σ')).not.toBeInTheDocument();
  });

  test('renders an empty state when no entry is ranked', () => {
    render(<Leaderboard benchmarks={[]} />);
    expect(screen.getByText('No verified results yet.')).toBeInTheDocument();
    expect(dataRows()).toHaveLength(1);

    const unranked = makeEntry('unranked', 0.9);
    unranked.verification.ranked = false;
    render(<Leaderboard benchmarks={[unranked]} />);
    expect(screen.getAllByText('No verified results yet.').length).toBeGreaterThan(0);
  });

  test('renders without benchmarks supplied at all', () => {
    render(<Leaderboard />);
    expect(screen.getByText('No verified results yet.')).toBeInTheDocument();
  });

  test('shows a loading state instead of the empty state while data is fetching', () => {
    render(<Leaderboard benchmarks={[]} isLoading={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('No verified results yet.')).not.toBeInTheDocument();
  });

  test('falls back from eventTeam to team to contributor', () => {
    const withEventTeam = makeEntry('event', 0.9);
    withEventTeam.nonlocalGame.eventTeam = 'Team Chupacabra';
    withEventTeam.team = ['Ada Lovelace', 'Grace Hopper'];
    withEventTeam.contributor = 'ada';

    const withTeam = makeEntry('team', 0.8);
    withTeam.team = ['Ada Lovelace', 'Grace Hopper'];
    withTeam.contributor = 'ada';

    const withContributor = makeEntry('contributor', 0.7);
    withContributor.contributor = 'ada';

    const withNothing = makeEntry('nothing', 0.6);
    delete withNothing.contributor;

    render(<Leaderboard benchmarks={[withEventTeam, withTeam, withContributor, withNothing]} />);

    const rows = dataRows();
    expect(within(rows[0]).getByText('Team Chupacabra')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Ada Lovelace, Grace Hopper')).toBeInTheDocument();
    expect(within(rows[2]).getByText('ada')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Unattributed')).toBeInTheDocument();
  });

  test('renders a ranked entry that carries no event fields', () => {
    const entry = makeEntry('core-only', 0.9);
    delete entry.nonlocalGame;
    delete entry.team;

    render(<Leaderboard benchmarks={[entry]} />);

    expect(screen.getByText('core-only-contributor')).toBeInTheDocument();
    expect(screen.getByText('Odd cycle C_3')).toBeInTheDocument();
    expect(screen.getByText('0.9000')).toBeInTheDocument();
  });
});
