export const COLORS = {
    bg: '#282828',
    bgCard: '#3c3836',
    border: '#504945',
    fg: '#ebdbb2',
    fgMuted: '#d5c4a1',
    fgSubtle: '#a89984',
    accentAqua: '#8ec07c',
    accentRed: '#cc241d',
    accentOrange: '#d65d0e',
    accentBlue: '#83a598',
    accentGreen: '#b8bb26'
};

export const CONFIG = {
    githubRepoUrl: 'https://github.com/cmortiz/qupacabras-db',
    benchmarksDataUrl: '/benchmarks.json'
};

export const UI_CONSTANTS = {
    appTitle: 'Qupacabras-DB',
    appDescription: 'A community-maintained database for tracking the performance of quantum experiments executed on quantum devices.',
    quantumIconUrl: 'https://cdn-icons-png.flaticon.com/512/2628/2628521.png',
    alienIconUrl: 'https://cdn-icons-png.flaticon.com/512/1970/1970363.png',
    version: '1.0'
};

export const FIELD_DESCRIPTIONS = {
    generalMetrics: {
        title: 'General Platform Metrics',
        description: 'Hardware and circuit-structural metrics that are comparable across different problems.'
    },
    problemSpecific: {
        title: 'Problem-Specific Metrics',
        description: 'Experiment-specific definitions and outcomes tied to a given nonlocal game or task instance.'
    },
    errorRates: {
        qubit: {
            title: 'Qubit Fidelity',
            description: 'Fidelity (computed as 1 - error) aggregated across all qubits used in the execution of the QASM files. This represents overall qubit performance during the experiment.'
        },
        readout: {
            title: 'Readout Fidelity',
            description: 'Readout fidelity (computed as 1 - error) aggregated across all experiments performed. This captures the accuracy of qubit state measurement.'
        },
        twoQubitGate: {
            title: '2Q Gate Fidelity',
            description: 'Two-qubit gate fidelity (computed as 1 - error) aggregated across all 2Q basis gates used in circuit execution.'
        },
        singleQubitGate: {
            title: '1Q Gate Fidelity',
            description: 'Single-qubit gate fidelity (computed as 1 - error) aggregated across all 1Q basis gates used in circuit execution.'
        }
    },
    executionTime: {
        title: 'Exec Time',
        description: 'Total execution time statistics aggregated across all experiments sent to the quantum computer, including queueing and processing time.'
    },
    general: {
        algorithm: 'The quantum experiment being benchmarked',
        device: 'The quantum device or simulator used for execution',
        metric: 'The primary performance metric being measured',
        value: 'The measured value of the primary metric',
        uncertainty: 'Statistical uncertainty of the primary metric measurement'
    }
};
