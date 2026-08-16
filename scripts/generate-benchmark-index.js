#!/usr/bin/env node

/**
 * Script to automatically generate benchmark index from submissions folder
 * This runs during the build process to create public/benchmarks.json
 *
 * This is the hard gate on published numbers. Every path by which a result reaches the site passes
 * through here: `build:ci` is this generator followed by `react-scripts build`, so a nonzero exit
 * skips the build and the deploy that depends on it, leaving Pages on the last good artifact. A
 * misfire freezes the site; it cannot corrupt it.
 *
 * Two rules follow from that.
 *
 * 1. A submitted `verification` block is deleted before the computed one is assigned. The schema
 *    already rejects the key, but this generator spreads submitted data into the index, so a forged
 *    block is destroyed here as well rather than only refused upstream.
 * 2. `verification-policy.json` decides whether a failure stops the build, and nothing else. A
 *    `report` build still recomputes every claim and still writes failures into the index as
 *    unverified and unranked. The mode never changes what the site claims.
 * 3. A `verify-override.json` can stop a failure from stopping the build, and can do nothing else.
 *    It is evaluated in `scripts/lib/nlg/io.js` under both modes, it only ever suppresses while its
 *    digest matches the counts on disk, and an entry it applies to is published as `overridden`:
 *    unverified, unranked, and naming the person who accepted the failure. Every override is
 *    reported here, applied or ignored, because an invisible one is indistinguishable from a
 *    verifier that stopped working.
 */

const fs = require('fs');
const path = require('path');
const { validateBenchmarkFile, checkDuplicates } = require('./validate-benchmark');
const { analyzeQASMFile } = require('./analyze-qasm');
const { verifySubmissionFolder, OVERRIDE_FILE } = require('./lib/nlg/io');
const { CHECK_IDS, VERIFIER_VERSION } = require('./lib/nlg/verify');

const SUBMISSIONS_DIR = path.join(__dirname, '../submissions');
const OUTPUT_FILE = path.join(__dirname, '../public/benchmarks.json');
const LAMBDA1_INDEX_FILE = path.join(__dirname, '../public/lambda1-index.json');
const POLICY_FILE = path.join(__dirname, '../verification-policy.json');

/** Mode used when the policy file is absent, unreadable, malformed or names something unknown. */
const DEFAULT_POLICY_MODE = 'report';

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {*} value - Candidate mode, from the environment or the policy file.
 * @returns {'enforce'|'report'|null} The recognised mode, or `null` when it is not one.
 */
function normalizePolicyMode(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const mode = value.trim().toLowerCase();
    return (mode === 'enforce' || mode === 'report') ? mode : null;
}

/**
 * Resolve the effective verification policy.
 *
 * Precedence is environment, then file, then the default. The default is `report` and the file is
 * read soft: a missing, unreadable, malformed or unrecognised policy degrades to `report` with a
 * warning rather than crashing the build, because a policy file is not a reason to fail a deploy.
 *
 * The mode controls only whether a verification failure stops the build. It never controls what is
 * recomputed or what the index records.
 *
 * @param {string} [policyFile] - Path to the policy file. Defaults to the repository's.
 * @param {Object} [env] - Environment to read `QDB_VERIFY` from. Defaults to `process.env`.
 * @returns {{mode: 'enforce'|'report', source: string}} The effective mode and where it came from.
 */
function resolvePolicy(policyFile, env) {
    const environment = isPlainObject(env) ? env : process.env;
    const fromEnv = normalizePolicyMode(environment.QDB_VERIFY);
    if (fromEnv !== null) {
        return { mode: fromEnv, source: 'QDB_VERIFY' };
    }
    if (typeof environment.QDB_VERIFY === 'string' && environment.QDB_VERIFY.trim() !== '') {
        console.warn(`⚠️  Ignoring QDB_VERIFY='${environment.QDB_VERIFY}': expected 'enforce' or 'report'`);
    }

    const file = typeof policyFile === 'string' && policyFile.length > 0 ? policyFile : POLICY_FILE;
    try {
        if (!fs.existsSync(file)) {
            return { mode: DEFAULT_POLICY_MODE, source: 'default (no policy file)' };
        }
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        const fromFile = normalizePolicyMode(isPlainObject(parsed) ? parsed.mode : null);
        if (fromFile === null) {
            console.warn(`⚠️  ${file} does not name a mode of 'enforce' or 'report'; using '${DEFAULT_POLICY_MODE}'`);
            return { mode: DEFAULT_POLICY_MODE, source: 'default (unrecognised mode)' };
        }
        return { mode: fromFile, source: file };
    } catch (error) {
        console.warn(`⚠️  Failed to read ${file}: ${error.message}; using '${DEFAULT_POLICY_MODE}'`);
        return { mode: DEFAULT_POLICY_MODE, source: 'default (unreadable policy file)' };
    }
}

/**
 * Verification block standing in for a recomputation that threw.
 *
 * A crash in the verifier degrades one entry to unverified rather than taking down the whole index
 * build, and the thrown message is recorded as a failed check so the reason is published rather
 * than swallowed.
 *
 * @param {string} message - The thrown message.
 * @returns {Object} A failed verification block.
 */
function crashedVerification(message) {
    return {
        verifierVersion: VERIFIER_VERSION,
        schemaVersion: null,
        status: 'failed',
        ranked: false,
        game: null,
        checks: [{
            id: CHECK_IDS.STRUCTURE,
            status: 'fail',
            message: `verification could not be completed: ${message}`
        }],
        countsSha256: null
    };
}

/**
 * Recompute a submission's nonlocal-game claim and attach the result to it.
 *
 * Gated on `nonlocalGame` being an object before any counts read is attempted, so a mocked or
 * unusual filesystem cannot be talked into handing back a benchmark document as a counts file.
 *
 * @param {Object} benchmarkData - Parsed benchmark, mutated in place.
 * @param {string} folderPath - Submission folder.
 * @param {string} folder - Folder name, for messages.
 * @returns {{folder: string, reasons: string[]}|null} A failure record, or `null` when the entry
 *   verified, warned only, or carried no claim to recompute.
 */
function attachVerification(benchmarkData, folderPath, folder) {
    // Defence in depth: the schema forbids a submitted `verification`, but this generator spreads
    // submitted data into the index, so a forged block is destroyed here before the computed one
    // is assigned rather than merely refused upstream.
    delete benchmarkData.verification;

    if (!isPlainObject(benchmarkData.nonlocalGame)) {
        return null;
    }

    let verification;
    let reasons;
    try {
        const verified = verifySubmissionFolder(folderPath, benchmarkData);
        if (verified === null) {
            return null;
        }
        verification = verified.verification;
        reasons = verified.errors.map(err => `${err.field}: ${err.message}`);
    } catch (error) {
        verification = crashedVerification(error.message);
        reasons = [`verification threw: ${error.message}`];
    }

    benchmarkData.verification = verification;

    if (verification.status !== 'failed') {
        return null;
    }
    if (reasons.length === 0) {
        reasons = verification.checks
            .filter(check => check.status === 'fail')
            .map(check => `${check.id}: ${check.message}`);
    }
    return { folder: folder, reasons: reasons };
}

/**
 * One line describing a submission's override, for the build log.
 *
 * Reads the record `scripts/lib/nlg/io.js` published on the verification block rather than the
 * override file, so this never touches the disk and stays behind the `nonlocalGame` gate that
 * every counts and override read sits behind.
 *
 * @param {*} verification - The computed verification block, when there is one.
 * @returns {string|null} The summary, or `null` when the submission carries no override.
 */
function describeOverride(verification) {
    if (!isPlainObject(verification) || !isPlainObject(verification.override)) {
        return null;
    }
    const override = verification.override;
    const outcome = override.applied === true ? 'APPLIED' : `IGNORED (${override.status})`;
    return `${outcome}: ${override.message}`;
}

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

/**
 * Build `public/benchmarks.json` from the submissions folder.
 *
 * @param {Object} [options] - Overrides, used by tests so a run can be pointed at a temporary
 *   corpus instead of the repository's own.
 * @param {string} [options.submissionsDir] - Folder to scan.
 * @param {string} [options.outputFile] - File to write.
 * @returns {Array} The benchmarks written.
 */
function generateBenchmarkIndex(options) {
    const settings = isPlainObject(options) ? options : {};
    const submissionsDir = typeof settings.submissionsDir === 'string'
        ? settings.submissionsDir
        : SUBMISSIONS_DIR;
    const outputFile = typeof settings.outputFile === 'string' ? settings.outputFile : OUTPUT_FILE;

    console.log('🔍 Scanning submissions directory...');
    const policy = resolvePolicy();
    console.log(`🔒 Verification policy: ${policy.mode} (from ${policy.source})`);
    const lambda1Index = loadLambda1Index();

    const benchmarks = [];
    const verificationFailures = [];
    const overrides = [];
    const submissionFolders = fs.readdirSync(submissionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'template')
        .map(dirent => dirent.name);

    console.log(`📁 Found ${submissionFolders.length} submission folders`);

    for (const folder of submissionFolders) {
        const folderPath = path.join(submissionsDir, folder);
        const benchmarkJsonPath = path.join(folderPath, 'benchmark.json');

        if (fs.existsSync(benchmarkJsonPath)) {
            // Use the new validation function. Verification is skipped here and run below instead:
            // an entry whose claim fails to reproduce still belongs in the index, marked unverified
            // and unranked, rather than being dropped the way a schema failure is.
            const validationResult = validateBenchmarkFile(benchmarkJsonPath, folder, { verify: false });

            if (validationResult.valid) {
                try {
                    // Use the data from validation result which may have auto-generated fields
                    const benchmarkData = validationResult.data || JSON.parse(fs.readFileSync(benchmarkJsonPath, 'utf8'));
                    
                    // Ensure benchmarkFolder matches the actual folder name
                    benchmarkData.benchmarkFolder = folder;

                    // Destroy any submitted verification block immediately, before anything reads
                    // or copies this object. The computed one is assigned after the metrics are
                    // built, so it is checked against the values actually published.
                    delete benchmarkData.verification;

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

                    // Recompute the claim from the counts. Runs whatever the policy says: the mode
                    // decides only whether a failure stops the build.
                    const failure = attachVerification(benchmarkData, folderPath, folder);
                    if (failure !== null) {
                        verificationFailures.push(failure);
                    }

                    const override = describeOverride(benchmarkData.verification);
                    if (override !== null) {
                        overrides.push({ folder: folder, note: override });
                    }

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

    // Report every override, whichever way it went. An applied one is the only way a failure
    // reaches the site, so it belongs in the log next to the failures rather than buried in the
    // index; an ignored one explains why a failure below was not suppressed.
    if (overrides.length > 0) {
        console.warn(`\n⚠️  ${overrides.length} submission(s) carry a ${OVERRIDE_FILE}:`);
        overrides.forEach(override => {
            console.warn(`   ${override.folder}: ${override.note}`);
        });
        console.warn('An applied override publishes the entry unverified and unranked on the ' +
            'record of the named approver. Delete the file once the failure itself is fixed.');
    }

    // Report verification failures, and under `enforce` stop here. Throwing before the write means
    // a rejected build leaves the previous public/benchmarks.json untouched on disk, so the site
    // keeps serving the last artifact that passed instead of a half-checked one.
    if (verificationFailures.length > 0) {
        const summary = `${verificationFailures.length} submission(s) failed verification:`;
        console.error(`\n❌ ${summary}`);
        verificationFailures.forEach(failure => {
            console.error(`   ${failure.folder}`);
            failure.reasons.forEach(reason => console.error(`      - ${reason}`));
        });

        if (policy.mode === 'enforce') {
            console.error('\nPolicy is "enforce", so the index was NOT written and the build stops here.');
            throw new Error(`Verification failed for ${verificationFailures.length} submission(s): ` +
                verificationFailures.map(failure => failure.folder).join(', '));
        }

        console.error('\nPolicy is "report", so the index is written anyway. These entries are ' +
            'recorded as unverified and unranked; they are not silently dropped and they are not ' +
            'presented as verified.');
    }

    // Ensure public directory exists
    const publicDir = path.dirname(outputFile);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the index file
    fs.writeFileSync(outputFile, JSON.stringify(benchmarks, null, 2));
    console.log(`\n🎉 Generated benchmarks.json with ${benchmarks.length} benchmarks`);

    return benchmarks;
}

// Attached as a property so `module.exports` stays a bare function: the existing Jest suite
// requires this module and calls it directly.
generateBenchmarkIndex.resolvePolicy = resolvePolicy;

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
