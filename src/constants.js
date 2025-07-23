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
    appDescription: 'A community-maintained database for tracking the performance of quantum algorithms executed on quantum devices.',
    quantumIconUrl: 'https://cdn-icons-png.flaticon.com/512/2628/2628521.png',
    alienIconUrl: 'https://cdn-icons-png.flaticon.com/512/1970/1970363.png'
};

export const FIELD_DESCRIPTIONS = {
    errorRates: {
        qubit: {
            title: 'Qubit Error',
            description: 'Statistical error rates aggregated across all qubits used in the execution of the QASM files. This represents the overall qubit performance during the experiment.'
        },
        readout: {
            title: 'Readout Error',
            description: 'Statistical readout/measurement error rates aggregated across all experiments performed. This captures the accuracy of qubit state measurement.'
        },
        twoQubitGate: {
            title: '2Q Gate Error',
            description: 'Statistical error rates for two-qubit basis gates aggregated across all 2Q gates used in the circuit execution.'
        },
        singleQubitGate: {
            title: '1Q Gate Error',
            description: 'Statistical error rates for single-qubit basis gates aggregated across all 1Q gates used in the circuit execution.'
        }
    },
    executionTime: {
        title: 'Exec Time',
        description: 'Total execution time statistics aggregated across all experiments sent to the quantum computer, including queueing and processing time.'
    },
    general: {
        algorithm: 'The quantum algorithm being benchmarked',
        device: 'The quantum device or simulator used for execution',
        metric: 'The primary performance metric being measured',
        value: 'The measured value of the primary metric',
        uncertainty: 'Statistical uncertainty of the primary metric measurement'
    }
};