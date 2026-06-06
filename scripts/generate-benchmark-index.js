#!/usr/bin/env node

/**
 * Script to automatically generate benchmark index from submissions folder
 * This runs during the build process to create public/benchmarks.json
 */

const fs = require('fs');
const path = require('path');
const { validateBenchmarkFile, checkDuplicates } = require('./validate-benchmark');
const { analyzeQASMFile } = require('./analyze-qasm');

const SUBMISSIONS_DIR = path.join(__dirname, '../submissions');
const OUTPUT_FILE = path.join(__dirname, '../public/benchmarks.json');
const LAMBDA1_INDEX_FILE = path.join(__dirname, '../public/lambda1-index.json');

function loadLambda1Index() {
    if (!fs.existsSync(LAMBDA1_INDEX_FILE)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(LAMBDA1_INDEX_FILE, 'utf8'));
    } catch (error) {
        console.warn(`⚠️  Failed to parse lambda1 index at ${LAMBDA1_INDEX_FILE}: ${error.message}`);
        return {};
    }
}

function computeQubitTimeVolume(benchmark) {
    const qubitCount = benchmark.quantumSpecific?.qubitCount;
    const circuitDuration = benchmark.timing?.circuitDuration;
    const t2 = benchmark.timing?.t2;

    if (
        qubitCount === null || qubitCount === undefined ||
        circuitDuration === null || circuitDuration === undefined ||
        Number.isNaN(Number(qubitCount)) || Number.isNaN(Number(circuitDuration))
    ) {
        return { raw: null, normalized: null };
    }

    const raw = Number(qubitCount) * Number(circuitDuration);
    const normalized = (t2 !== null && t2 !== undefined && !Number.isNaN(Number(t2)) && Number(t2) > 0)
        ? raw / Number(t2)
        : null;

    return { raw, normalized };
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function deriveFidelity(explicitValue, errorStats) {
    const explicit = toNumberOrNull(explicitValue);
    if (explicit !== null) return explicit;
    const mean = toNumberOrNull(errorStats?.mean);
    if (mean === null) return null;
    return 1 - mean;
}

function buildMetricCategories(benchmarkData, lambda1Entry, qasmRangeData) {
    const primaryMetric = {
        name: benchmarkData.problemSpecific?.primaryMetric?.name || benchmarkData.metricName || null,
        definition: benchmarkData.problemSpecific?.primaryMetric?.definition || benchmarkData.primaryMetricDefinition || null,
        value: toNumberOrNull(benchmarkData.problemSpecific?.primaryMetric?.value ?? benchmarkData.metricValue),
        uncertainty: toNumberOrNull(benchmarkData.problemSpecific?.primaryMetric?.uncertainty ?? benchmarkData.uncertainty),
        uncertaintyDefinition: benchmarkData.problemSpecific?.primaryMetric?.uncertaintyDefinition || benchmarkData.uncertaintyDefinition || null
    };

    const timing = benchmarkData.generalMetrics?.timing || benchmarkData.timing || null;
    const qubitCount = toNumberOrNull(
        benchmarkData.problemSpecific?.qubitRange?.max ??
        benchmarkData.quantumSpecific?.qubitCount
    );
    const circuitDepth = toNumberOrNull(
        benchmarkData.generalMetrics?.circuitDepth ?? benchmarkData.quantumSpecific?.circuitDepth
    );

    const generalMetrics = {
        ...(benchmarkData.generalMetrics || {}),
        lambda1: lambda1Entry.lambda1 ?? benchmarkData.generalMetrics?.lambda1 ?? benchmarkData.lambda1 ?? null,
        lambda1Source: lambda1Entry.lambda1Source ?? benchmarkData.generalMetrics?.lambda1Source ?? benchmarkData.lambda1Source ?? null,
        circuitDepth,
        gateFidelity: {
            ...(benchmarkData.generalMetrics?.gateFidelity || {}),
            oneQubit: deriveFidelity(benchmarkData.generalMetrics?.gateFidelity?.oneQubit ?? benchmarkData.one_qubit_fidelity, benchmarkData.errorRates?.singleQubitGate),
            twoQubit: deriveFidelity(benchmarkData.generalMetrics?.gateFidelity?.twoQubit ?? benchmarkData.two_qubit_fidelity, benchmarkData.errorRates?.twoQubitGate),
            measurementMethod: benchmarkData.generalMetrics?.gateFidelity?.measurementMethod || benchmarkData.fidelity_measurement_method || null,
            reference: benchmarkData.generalMetrics?.gateFidelity?.reference || null
        },
        readoutFidelity: deriveFidelity(benchmarkData.generalMetrics?.readoutFidelity, benchmarkData.errorRates?.readout),
        qubitFidelity: deriveFidelity(benchmarkData.generalMetrics?.qubitFidelity ?? benchmarkData.qubitFidelity, benchmarkData.errorRates?.qubit),
        timing: timing ? {
            circuitDuration: toNumberOrNull(timing.circuitDuration),
            t1: toNumberOrNull(timing.t1),
            t2: toNumberOrNull(timing.t2),
            unit: timing.unit || 'us'
        } : null,
        runtimeOverT1: null,
        runtimeOverT2: null,
        qubitTimeVolume: null,
        qubitTimeVolumeNormalized: null
    };

    const qtv = computeQubitTimeVolume({ quantumSpecific: { qubitCount }, timing: generalMetrics.timing });
    generalMetrics.qubitTimeVolume = qtv.raw;
    generalMetrics.qubitTimeVolumeNormalized = qtv.normalized;

    const duration = toNumberOrNull(generalMetrics.timing?.circuitDuration);
    const t1 = toNumberOrNull(generalMetrics.timing?.t1);
    const t2 = toNumberOrNull(generalMetrics.timing?.t2);
    if (duration !== null && t1 !== null && t1 > 0) {
        generalMetrics.runtimeOverT1 = duration / t1;
    }
    if (duration !== null && t2 !== null && t2 > 0) {
        generalMetrics.runtimeOverT2 = duration / t2;
    }

    const problemSpecific = {
        ...(benchmarkData.problemSpecific || {}),
        description: benchmarkData.problemSpecific?.description || benchmarkData.description || null,
        primaryMetric,
        qubitRange: benchmarkData.problemSpecific?.qubitRange || qasmRangeData.qubitRange || (qubitCount !== null ? { min: qubitCount, max: qubitCount } : null),
        depthRange: benchmarkData.problemSpecific?.depthRange || qasmRangeData.depthRange || (circuitDepth !== null ? { min: circuitDepth, max: circuitDepth } : null),
        shots: toNumberOrNull(benchmarkData.problemSpecific?.shots ?? benchmarkData.quantumSpecific?.shots),
        methodology: benchmarkData.problemSpecific?.methodology || benchmarkData.methodology || null,
        notes: benchmarkData.problemSpecific?.notes || benchmarkData.notes || null
    };

    benchmarkData.metricName = primaryMetric.name;
    benchmarkData.metricValue = primaryMetric.value;
    benchmarkData.uncertainty = primaryMetric.uncertainty;
    benchmarkData.uncertaintyDefinition = primaryMetric.uncertaintyDefinition;

    benchmarkData.generalMetrics = generalMetrics;
    benchmarkData.problemSpecific = problemSpecific;
    benchmarkData.qubitTimeVolume = generalMetrics.qubitTimeVolume;
    benchmarkData.qubitTimeVolumeNormalized = generalMetrics.qubitTimeVolumeNormalized;
    benchmarkData.lambda1 = generalMetrics.lambda1;
    benchmarkData.lambda1Source = generalMetrics.lambda1Source;
}

function generateBenchmarkIndex() {
    console.log('🔍 Scanning submissions directory...');
    const lambda1Index = loadLambda1Index();
    
    const benchmarks = [];
    const submissionFolders = fs.readdirSync(SUBMISSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'template')
        .map(dirent => dirent.name);

    console.log(`📁 Found ${submissionFolders.length} submission folders`);

    for (const folder of submissionFolders) {
        const folderPath = path.join(SUBMISSIONS_DIR, folder);
        const benchmarkJsonPath = path.join(folderPath, 'benchmark.json');
        
        if (fs.existsSync(benchmarkJsonPath)) {
            // Use the new validation function
            const validationResult = validateBenchmarkFile(benchmarkJsonPath, folder);
            
            if (validationResult.valid) {
                try {
                    // Use the data from validation result which may have auto-generated fields
                    const benchmarkData = validationResult.data || JSON.parse(fs.readFileSync(benchmarkJsonPath, 'utf8'));
                    
                    // Ensure benchmarkFolder matches the actual folder name
                    benchmarkData.benchmarkFolder = folder;

                    // Attach computed spectral gap fields if available
                    const lambda1Entry = lambda1Index[folder] || {};
                    
                    // Auto-generate ID if not present
                    if (!benchmarkData.id) {
                        benchmarkData.id = folder;
                    }
                    
                    // Auto-generate timestamp if not present
                    if (!benchmarkData.timestamp) {
                        benchmarkData.timestamp = new Date().toISOString();
                    } else {
                        // Parse timestamp to ensure it's valid
                        benchmarkData.timestamp = new Date(benchmarkData.timestamp).toISOString();
                    }
                    
                    // Auto-populate quantum properties from QASM files if available
                    let qasmRangeData = { qubitRange: null, depthRange: null };
                    if (benchmarkData.qasmFiles && benchmarkData.qasmFiles.length > 0) {
                        console.log(`   📊 Analyzing QASM files for ${folder}...`);
                        let totalAnalysis = null;
                        let fileCount = 0;
                        const perFileAnalyses = [];
                        
                        for (const qasmFile of benchmarkData.qasmFiles) {
                            const qasmPath = path.join(folderPath, qasmFile);
                            if (fs.existsSync(qasmPath)) {
                                const analysis = analyzeQASMFile(qasmPath);
                                if (analysis) {
                                    fileCount++;
                                    perFileAnalyses.push(analysis);
                                    // If this is the first file, use it as base
                                    if (!totalAnalysis) {
                                        totalAnalysis = analysis;
                                    } else {
                                        // For multiple files, we'll use the first file's properties
                                        // but note that there are multiple circuits
                                    }
                                }
                            }
                        }
                        
                        // Update quantum properties if analysis succeeded
                        if (totalAnalysis) {
                            if (!benchmarkData.quantumSpecific) {
                                benchmarkData.quantumSpecific = {};
                            }
                            
                            // Auto-populate from QASM analysis, preserving existing manual entries
                            const autoPopulated = [];
                            
                            // Only update if not already present
                            if (benchmarkData.quantumSpecific.qubitCount === undefined) {
                                benchmarkData.quantumSpecific.qubitCount = totalAnalysis.qubitCount;
                                autoPopulated.push('qubitCount');
                            }
                            if (benchmarkData.quantumSpecific.gateCount === undefined) {
                                benchmarkData.quantumSpecific.gateCount = totalAnalysis.gateCount;
                                autoPopulated.push('gateCount');
                            }
                            if (benchmarkData.quantumSpecific.circuitDepth === undefined) {
                                benchmarkData.quantumSpecific.circuitDepth = totalAnalysis.circuitDepth;
                                autoPopulated.push('circuitDepth');
                            }
                            if (benchmarkData.quantumSpecific.twoQubitGateCount === undefined) {
                                benchmarkData.quantumSpecific.twoQubitGateCount = totalAnalysis.twoQubitGateCount;
                                autoPopulated.push('twoQubitGateCount');
                            }
                            if (benchmarkData.quantumSpecific.singleQubitGateCount === undefined) {
                                benchmarkData.quantumSpecific.singleQubitGateCount = totalAnalysis.singleQubitGateCount;
                                autoPopulated.push('singleQubitGateCount');
                            }
                            if (benchmarkData.quantumSpecific.measurementCount === undefined) {
                                benchmarkData.quantumSpecific.measurementCount = totalAnalysis.measurementCount;
                                autoPopulated.push('measurementCount');
                            }
                            
                            // Add gate breakdown if not present
                            if (Object.keys(totalAnalysis.gateTypes).length > 0 && !benchmarkData.quantumSpecific.gateBreakdown) {
                                benchmarkData.quantumSpecific.gateBreakdown = totalAnalysis.gateTypes;
                                autoPopulated.push('gateBreakdown');
                            }
                            
                            // If multiple QASM files and circuitVariations not set, note it
                            if (fileCount > 1 && benchmarkData.quantumSpecific.circuitVariations === undefined) {
                                benchmarkData.quantumSpecific.circuitVariations = fileCount;
                                autoPopulated.push('circuitVariations');
                            }
                            
                            if (autoPopulated.length > 0) {
                                console.log(`   ✅ Auto-populated quantum properties: ${autoPopulated.join(', ')}`);
                            } else {
                                console.log(`   ℹ️  All quantum properties already present, skipping auto-population`);
                            }

                            const qubitCounts = perFileAnalyses.map(a => a.qubitCount).filter(v => typeof v === 'number');
                            const depthCounts = perFileAnalyses.map(a => a.circuitDepth).filter(v => typeof v === 'number');
                            qasmRangeData = {
                                qubitRange: qubitCounts.length > 0 ? { min: Math.min(...qubitCounts), max: Math.max(...qubitCounts) } : null,
                                depthRange: depthCounts.length > 0 ? { min: Math.min(...depthCounts), max: Math.max(...depthCounts) } : null
                            };
                        }
                    }

                    buildMetricCategories(benchmarkData, lambda1Entry, qasmRangeData);
                    
                    benchmarks.push(benchmarkData);
                    console.log(`✅ Added benchmark: ${benchmarkData.algorithmName} (${folder})`);
                    
                    // Display warnings if any
                    if (validationResult.warnings.length > 0) {
                        console.warn(`⚠️  ${folder} warnings:`);
                        validationResult.warnings.forEach(warning => 
                            console.warn(`   - ${warning.field}: ${warning.message}`)
                        );
                    }
                } catch (error) {
                    console.error(`❌ Error processing ${folder}/benchmark.json:`, error.message);
                }
            } else {
                console.error(`❌ ${folder}: Validation failed`);
                validationResult.errors.forEach(err => 
                    console.error(`   - ${err.field}: ${err.message}`)
                );
            }
        } else {
            console.warn(`⚠️  ${folder}: No benchmark.json found`);
        }
    }

    // Sort benchmarks by timestamp (newest first)
    benchmarks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Check for duplicates
    console.log('\n🔍 Checking for duplicate submissions...');
    const duplicates = checkDuplicates(benchmarks);
    
    if (duplicates.length > 0) {
        console.warn('⚠️  Potential duplicates detected:');
        duplicates.forEach(dup => {
            console.warn(`   - ${dup.current} may duplicate ${dup.existing} (${dup.signature})`);
        });
        console.warn('\nConsider reviewing these submissions for uniqueness.');
    }

    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the index file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(benchmarks, null, 2));
    console.log(`\n🎉 Generated benchmarks.json with ${benchmarks.length} benchmarks`);
    
    return benchmarks;
}

// Run if called directly
if (require.main === module) {
    try {
        generateBenchmarkIndex();
    } catch (error) {
        console.error('❌ Failed to generate benchmark index:', error);
        process.exit(1);
    }
}

module.exports = generateBenchmarkIndex;
