#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SUBMISSIONS_DIR = path.join(__dirname, '../submissions');

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function migrateBenchmark(data) {
    const metricName = data.metricName || data.problemSpecific?.primaryMetric?.name || null;
    const metricValue = toNumberOrNull(data.metricValue ?? data.problemSpecific?.primaryMetric?.value);

    const generalMetrics = {
        ...(data.generalMetrics || {}),
        lambda1: data.generalMetrics?.lambda1 ?? data.lambda1 ?? null,
        lambda1Source: data.generalMetrics?.lambda1Source ?? data.lambda1Source ?? null,
        circuitDepth: data.generalMetrics?.circuitDepth ?? data.quantumSpecific?.circuitDepth ?? null,
        gateFidelity: {
            ...(data.generalMetrics?.gateFidelity || {}),
            oneQubit: toNumberOrNull(data.generalMetrics?.gateFidelity?.oneQubit ?? data.one_qubit_fidelity),
            twoQubit: toNumberOrNull(data.generalMetrics?.gateFidelity?.twoQubit ?? data.two_qubit_fidelity),
            measurementMethod: data.generalMetrics?.gateFidelity?.measurementMethod ?? data.fidelity_measurement_method ?? null,
            reference: data.generalMetrics?.gateFidelity?.reference ?? null
        },
        readoutFidelity: toNumberOrNull(data.generalMetrics?.readoutFidelity),
        qubitFidelity: toNumberOrNull(data.generalMetrics?.qubitFidelity ?? data.qubitFidelity),
        timing: data.generalMetrics?.timing || data.timing || null,
        runtimeOverT1: data.generalMetrics?.runtimeOverT1 ?? null,
        runtimeOverT2: data.generalMetrics?.runtimeOverT2 ?? null,
        qubitTimeVolume: data.generalMetrics?.qubitTimeVolume ?? data.qubitTimeVolume ?? null,
        qubitTimeVolumeNormalized: data.generalMetrics?.qubitTimeVolumeNormalized ?? data.qubitTimeVolumeNormalized ?? null
    };

    const qubitCount = data.quantumSpecific?.qubitCount;
    const depth = data.quantumSpecific?.circuitDepth;
    const problemSpecific = {
        ...(data.problemSpecific || {}),
        description: data.problemSpecific?.description ?? data.description ?? null,
        primaryMetric: {
            ...(data.problemSpecific?.primaryMetric || {}),
            name: metricName,
            definition: data.problemSpecific?.primaryMetric?.definition ?? data.primaryMetricDefinition ?? null,
            value: metricValue,
            uncertainty: toNumberOrNull(data.problemSpecific?.primaryMetric?.uncertainty ?? data.uncertainty),
            uncertaintyDefinition: data.problemSpecific?.primaryMetric?.uncertaintyDefinition ?? data.uncertaintyDefinition ?? null
        },
        qubitRange: data.problemSpecific?.qubitRange ?? (qubitCount != null ? { min: qubitCount, max: qubitCount } : null),
        depthRange: data.problemSpecific?.depthRange ?? (depth != null ? { min: depth, max: depth } : null),
        shots: toNumberOrNull(data.problemSpecific?.shots ?? data.quantumSpecific?.shots),
        methodology: data.problemSpecific?.methodology ?? data.methodology ?? null,
        notes: data.problemSpecific?.notes ?? data.notes ?? null
    };

    return {
        ...data,
        metricName,
        metricValue,
        uncertainty: problemSpecific.primaryMetric.uncertainty,
        uncertaintyDefinition: problemSpecific.primaryMetric.uncertaintyDefinition,
        generalMetrics,
        problemSpecific
    };
}

function runMigration() {
    const folders = fs.readdirSync(SUBMISSIONS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'template')
        .map(d => d.name);

    let migrated = 0;
    for (const folder of folders) {
        const benchmarkPath = path.join(SUBMISSIONS_DIR, folder, 'benchmark.json');
        if (!fs.existsSync(benchmarkPath)) continue;

        try {
            const data = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
            const migratedData = migrateBenchmark(data);
            fs.writeFileSync(benchmarkPath, JSON.stringify(migratedData, null, 2));
            migrated += 1;
        } catch (error) {
            console.warn(`Skipping ${folder}: ${error.message}`);
        }
    }

    console.log(`Migrated ${migrated} benchmark files.`);
}

if (require.main === module) {
    runMigration();
}

module.exports = { migrateBenchmark };
