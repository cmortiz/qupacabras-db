#!/usr/bin/env node

/**
 * Benchmark validation utility using JSON Schema
 * Can be used for CI/CD, pre-commit hooks, and CLI validation
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { verifySubmissionFolder, loadCountsFile } = require('./lib/nlg/io');

// Initialize AJV with all formats
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

const SUBMISSIONS_DIR = path.join(__dirname, '../submissions');

// Load the schema
const schemaPath = path.join(__dirname, '../schemas/benchmark-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Compile the validation function
const validate = ajv.compile(schema);

/**
 * @param {*} value - Candidate.
 * @returns {boolean} Whether the value is a non-null, non-array object.
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recompute a nonlocal-game claim from the counts the submission ships, and fold the outcome into
 * a schema validation result.
 *
 * Gated on `nonlocalGame` being an object, twice over: `verifySubmissionFolder` returns `null`
 * without it, and the call site checks as well. The gate is what keeps a counts read out of code
 * paths where `fs` is mocked wholesale with `existsSync` returning `true`.
 *
 * Issues are pushed as `{field, message, code}`. The extra `code` is additive: every consumer of
 * this result reads only `field` and `message`. The computed block is attached as
 * `result.verification`, a sibling of `errors`, so it survives flattening.
 *
 * @param {Object} benchmarkData - Parsed benchmark document.
 * @param {string} benchmarkPath - Path to the benchmark.json file.
 * @param {Object} result - Validation result to fold the outcome into, mutated in place.
 * @returns {void}
 */
function applyNonlocalGameVerification(benchmarkData, benchmarkPath, result) {
    if (!isPlainObject(benchmarkData) || !isPlainObject(benchmarkData.nonlocalGame)) {
        return;
    }

    let verified;
    try {
        verified = verifySubmissionFolder(path.dirname(benchmarkPath), benchmarkData);
    } catch (error) {
        result.valid = false;
        result.errors.push({
            field: 'nonlocalGame',
            message: `Verification could not be completed: ${error.message}`,
            code: 'VERIFIER_CRASHED'
        });
        return;
    }

    if (verified === null) {
        return;
    }

    result.verification = verified.verification;
    verified.errors.forEach(err => result.errors.push(err));
    verified.warnings.forEach(warn => result.warnings.push(warn));
    if (!verified.valid) {
        result.valid = false;
    }
}

/**
 * Validates a single benchmark.json file
 * @param {string} benchmarkPath - Path to the benchmark.json file
 * @param {string} folderName - Name of the submission folder
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.verify] - Set to `false` to skip the nonlocal-game recomputation.
 *   `generate-benchmark-index.js` passes `false` because it recomputes the block itself and needs
 *   a failing entry to reach the index marked unverified rather than be dropped as invalid.
 * @returns {Object} Validation result with errors array, plus `verification` when a nonlocal-game
 *   claim was recomputed
 */
function validateBenchmarkFile(benchmarkPath, folderName, options) {
    const settings = isPlainObject(options) ? options : {};
    const result = {
        valid: true,
        errors: [],
        warnings: []
    };

    try {
        // Read and parse the benchmark file
        const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

        // Validate against schema
        const valid = validate(benchmarkData);

        if (!valid) {
            result.valid = false;
            result.errors = validate.errors.map(err => ({
                field: err.instancePath || 'root',
                message: err.message,
                params: err.params
            }));
        }

        // Additional validations beyond schema

        if (benchmarkData.generalMetrics && typeof benchmarkData.generalMetrics !== 'object') {
            result.warnings.push({
                field: 'generalMetrics',
                message: 'generalMetrics should be an object when provided'
            });
        }

        if (benchmarkData.problemSpecific && typeof benchmarkData.problemSpecific !== 'object') {
            result.warnings.push({
                field: 'problemSpecific',
                message: 'problemSpecific should be an object when provided'
            });
        }

        if (benchmarkData.problemSpecific?.primaryMetric?.name && benchmarkData.metricName && benchmarkData.problemSpecific.primaryMetric.name !== benchmarkData.metricName) {
            result.warnings.push({
                field: 'problemSpecific.primaryMetric.name',
                message: 'primary metric name differs from top-level metricName'
            });
        }

        if (benchmarkData.problemSpecific?.primaryMetric?.value !== undefined && benchmarkData.metricValue !== undefined) {
            const topLevel = Number(benchmarkData.metricValue);
            const nested = Number(benchmarkData.problemSpecific.primaryMetric.value);
            if (!Number.isNaN(topLevel) && !Number.isNaN(nested) && Math.abs(topLevel - nested) > 1e-9) {
                result.warnings.push({
                    field: 'problemSpecific.primaryMetric.value',
                    message: 'primary metric value differs from top-level metricValue'
                });
            }
        }

        // Auto-generate ID if not provided
        if (!benchmarkData.id) {
            benchmarkData.id = folderName;
            result.warnings.push({
                field: 'id',
                message: `ID auto-generated from folder name: '${folderName}'`
            });
        } else if (benchmarkData.id !== folderName) {
            result.warnings.push({
                field: 'id',
                message: `ID '${benchmarkData.id}' doesn't match folder name '${folderName}' (consider using folder name)`
            });
        }

        // Validate QASM files exist
        if (benchmarkData.qasmFiles && Array.isArray(benchmarkData.qasmFiles)) {
            const folderPath = path.dirname(benchmarkPath);
            benchmarkData.qasmFiles.forEach(qasmFile => {
                const qasmPath = path.join(folderPath, qasmFile);
                if (!fs.existsSync(qasmPath)) {
                    result.warnings.push({
                        field: 'qasmFiles',
                        message: `QASM file '${qasmFile}' not found (optional)`
                    });
                }
            });
        }

        // Auto-generate timestamp if not provided
        if (!benchmarkData.timestamp) {
            benchmarkData.timestamp = new Date().toISOString();
            result.warnings.push({
                field: 'timestamp',
                message: `Timestamp auto-generated: ${benchmarkData.timestamp}`
            });
        }

        // Recompute any nonlocal-game claim from its counts, so a reported number is checked
        // rather than trusted. Entries without a nonlocalGame block are untouched.
        if (settings.verify !== false) {
            applyNonlocalGameVerification(benchmarkData, benchmarkPath, result);
        }

        // Store the potentially modified data
        result.data = benchmarkData;

        return result;

    } catch (error) {
        result.valid = false;
        result.errors.push({
            field: 'file',
            message: `Error reading/parsing file: ${error.message}`
        });
        return result;
    }
}

/**
 * Basic QASM content validation
 */
// eslint-disable-next-line no-unused-vars
function validateQASMContent(content) {
    // Check for common QASM headers/keywords
    const qasmPatterns = [
        /OPENQASM\s+[0-9.]+/i,
        /qreg\s+\w+\[\d+\]/,
        /creg\s+\w+\[\d+\]/,
        /include\s+"[\w.]+"/
    ];

    return qasmPatterns.some(pattern => pattern.test(content));
}

/**
 * Validate statistical value consistency
 */
// eslint-disable-next-line no-unused-vars
function validateStatisticalConsistency(stats, fieldName, result, checkRange = true) {
    // Check min <= median <= max
    if (stats.min > stats.median) {
        result.warnings.push({
            field: fieldName,
            message: 'Minimum value should not exceed median value'
        });
    }

    if (stats.median > stats.max) {
        result.warnings.push({
            field: fieldName,
            message: 'Median value should not exceed maximum value'
        });
    }

    if (stats.min > stats.max) {
        result.errors.push({
            field: fieldName,
            message: 'Minimum value cannot exceed maximum value'
        });
        result.valid = false;
    }

    // Check mean is within min/max range
    if (stats.mean < stats.min || stats.mean > stats.max) {
        result.warnings.push({
            field: fieldName,
            message: 'Mean value should be between minimum and maximum values'
        });
    }

    // For error rates, warn if values seem too high
    if (checkRange && stats.max > 0.5) {
        result.warnings.push({
            field: fieldName,
            message: 'Error rate above 50% seems unusually high'
        });
    }
}

/**
 * Team a nonlocal-game submission is attributed to, for duplicate detection.
 *
 * The chain ends at the empty string, and it reaches it often: `eventTeam` is optional, `team[]`
 * and `contributor` are both optional in the schema. That is why the signature this feeds cannot
 * rest on the team alone. Two dozen teams filing the same game with the same parameters on the same
 * day would otherwise share one signature and be reported as duplicates of each other.
 *
 * @param {Object} benchmark - Parsed benchmark document carrying a `nonlocalGame` block.
 * @returns {string} A stable team key, possibly empty.
 */
function duplicateTeamKey(benchmark) {
    const eventTeam = benchmark.nonlocalGame.eventTeam;
    if (typeof eventTeam === 'string' && eventTeam.length > 0) {
        return eventTeam;
    }
    if (Array.isArray(benchmark.team) && benchmark.team.length > 0) {
        return benchmark.team.map(String).sort().join('+');
    }
    if (typeof benchmark.contributor === 'string' && benchmark.contributor.length > 0) {
        return benchmark.contributor;
    }
    return '';
}

/**
 * Canonical rendering of the integer parameters selecting a member of a game family.
 *
 * Keys are sorted, so `{n: 3, k: 2}` and `{k: 2, n: 3}` are the same game.
 *
 * @param {*} params - `nonlocalGame.params`, possibly absent.
 * @returns {string} Canonical form.
 */
function duplicateParamsKey(params) {
    if (!isPlainObject(params)) {
        return '';
    }
    return Object.keys(params).sort()
        .map(key => `${key}=${String(params[key])}`)
        .join(',');
}

/**
 * Digest of the measurement counts a nonlocal-game submission ships.
 *
 * This is what separates two honest runs that agree on everything else. Independent hardware runs
 * never produce byte-identical counts, so a shared digest means the same data was filed twice,
 * which is exactly what duplicate detection is for. The read goes through `loadCountsFile`, which
 * owns the path checks on the submitter-controlled `countsFile` name.
 *
 * Returns the empty string when there is nothing to digest. That degrades to the old behaviour for
 * the folder rather than inventing a distinction the data does not support.
 *
 * @param {Object} benchmark - Parsed benchmark document carrying a `nonlocalGame` block.
 * @param {string} [submissionsDir] - Directory holding the submission folders.
 * @returns {string} Hex digest, or the empty string.
 */
function duplicateCountsKey(benchmark, submissionsDir) {
    const folder = benchmark.benchmarkFolder;
    const countsFile = benchmark.nonlocalGame.countsFile;
    if (typeof folder !== 'string' || folder === '' || typeof countsFile !== 'string') {
        return '';
    }
    const root = typeof submissionsDir === 'string' ? submissionsDir : SUBMISSIONS_DIR;
    let loaded;
    try {
        loaded = loadCountsFile(path.join(root, folder), countsFile);
    } catch (error) {
        return '';
    }
    return loaded.ok === true ? loaded.sha256 : '';
}

/**
 * Signature identifying one nonlocal-game run.
 *
 * Keyed on (team, game, params, run, counts digest) and NOT on the reported value. Several teams
 * playing the same game on the same hardware legitimately land on near-identical win rates, so the
 * value-similarity test that catches copied legacy entries would flag honest independent results
 * here. The run component is the experiment date, falling back to the submission timestamp: a
 * genuine second run carries a different one, while a copied folder carries the same and is
 * flagged.
 *
 * The counts digest is what makes the signature usable at event scale. The first four components
 * are all shared by design when two dozen teams file the same game on the same day, and the team
 * key is empty whenever none of `eventTeam`, `team[]` or `contributor` is filled in, so without the
 * digest those submissions collapse onto one signature and every one of them is reported as a
 * duplicate of the first. The reports are warnings rather than failures, so this was noise rather
 * than breakage, but it is noise arriving exactly when the signal matters.
 *
 * @param {Object} benchmark - Parsed benchmark document carrying a `nonlocalGame` block.
 * @param {string} [submissionsDir] - Directory holding the submission folders.
 * @returns {string} Signature, namespaced so it cannot collide with a legacy signature.
 */
function nonlocalGameSignature(benchmark, submissionsDir) {
    const game = benchmark.nonlocalGame.game;
    const params = duplicateParamsKey(benchmark.nonlocalGame.params);
    const run = benchmark.experimentDate || benchmark.timestamp || '';
    const counts = duplicateCountsKey(benchmark, submissionsDir);
    return `nlg:${duplicateTeamKey(benchmark)}-${game}-${params}-${run}-${counts}`;
}

/**
 * Check for duplicate submissions
 *
 * @param {Object[]} allBenchmarks - Parsed documents, each carrying `benchmarkFolder`.
 * @param {string} [submissionsDir] - Directory holding the submission folders, for the counts
 *   digest a nonlocal-game signature includes.
 * @returns {Array<{current: string, existing: string, signature: string}>} Reported duplicates.
 */
function checkDuplicates(allBenchmarks, submissionsDir) {
    const duplicates = [];
    const seen = new Map();

    allBenchmarks.forEach((benchmark) => {
        // Create a signature for comparison
        const nonlocal = isPlainObject(benchmark.nonlocalGame);
        const signature = nonlocal
            ? nonlocalGameSignature(benchmark, submissionsDir)
            : `${benchmark.algorithmName}-${benchmark.device}-${benchmark.metricName}`;

        if (seen.has(signature)) {
            const existing = seen.get(signature);
            // Matching (team, game, params, run) is a duplicate on its own. For everything else,
            // check whether values are suspiciously similar.
            if (nonlocal || Math.abs(benchmark.metricValue - existing.metricValue) < 0.0001) {
                duplicates.push({
                    current: benchmark.id,
                    existing: existing.id,
                    signature: signature
                });
            }
        } else {
            seen.set(signature, benchmark);
        }
    });

    return duplicates;
}

/**
 * Validate all benchmarks in a directory
 */
function validateAllBenchmarks(submissionsDir) {
    console.log('🔍 Validating all benchmarks...\n');

    const allBenchmarks = [];
    const validationResults = [];

    // Get all submission folders
    const folders = fs.readdirSync(submissionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'template')
        .map(dirent => dirent.name);

    // Validate each submission
    folders.forEach(folder => {
        const benchmarkPath = path.join(submissionsDir, folder, 'benchmark.json');

        if (fs.existsSync(benchmarkPath)) {
            console.log(`📁 Validating ${folder}...`);
            const result = validateBenchmarkFile(benchmarkPath, folder);

            if (result.valid) {
                const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
                benchmarkData.benchmarkFolder = folder;
                allBenchmarks.push(benchmarkData);
                console.log(`✅ ${folder}: Valid`);
            } else {
                console.log(`❌ ${folder}: Invalid`);
                result.errors.forEach(err => {
                    console.log(`   - ${err.field}: ${err.message}`);
                });
            }

            if (result.warnings.length > 0) {
                console.log(`⚠️  Warnings:`);
                result.warnings.forEach(warn => {
                    console.log(`   - ${warn.field}: ${warn.message}`);
                });
            }

            validationResults.push({
                folder,
                ...result
            });

            console.log('');
        } else {
            console.log(`⚠️  ${folder}: No benchmark.json found\n`);
            validationResults.push({
                folder,
                valid: false,
                errors: [{ field: 'file', message: 'benchmark.json not found' }],
                warnings: []
            });
        }
    });

    // Check for duplicates
    console.log('🔍 Checking for duplicate submissions...');
    const duplicates = checkDuplicates(allBenchmarks, submissionsDir);

    if (duplicates.length > 0) {
        console.log('⚠️  Potential duplicates found:');
        duplicates.forEach(dup => {
            console.log(`   - ${dup.current} may duplicate ${dup.existing} (${dup.signature})`);
        });
    } else {
        console.log('✅ No duplicates found');
    }

    // Summary
    console.log('\n📊 Summary:');
    const validCount = validationResults.filter(r => r.valid).length;
    const invalidCount = validationResults.filter(r => !r.valid).length;
    console.log(`   Total submissions: ${validationResults.length}`);
    console.log(`   Valid: ${validCount}`);
    console.log(`   Invalid: ${invalidCount}`);
    console.log(`   Duplicates: ${duplicates.length}`);

    return {
        results: validationResults,
        duplicates,
        allValid: invalidCount === 0
    };
}

// CLI functionality
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        // Validate all submissions
        const submissionsDir = path.join(__dirname, '../submissions');
        const { allValid } = validateAllBenchmarks(submissionsDir);
        process.exit(allValid ? 0 : 1);
    } else if (args[0] === '--file' && args[1]) {
        // Validate single file
        const benchmarkPath = path.resolve(args[1]);
        const folderName = path.basename(path.dirname(benchmarkPath));
        const result = validateBenchmarkFile(benchmarkPath, folderName);

        console.log(`Validating ${benchmarkPath}...`);
        if (result.valid) {
            console.log('✅ Valid');
        } else {
            console.log('❌ Invalid');
            result.errors.forEach(err => {
                console.log(`   - ${err.field}: ${err.message}`);
            });
        }

        if (result.warnings.length > 0) {
            console.log('⚠️  Warnings:');
            result.warnings.forEach(warn => {
                console.log(`   - ${warn.field}: ${warn.message}`);
            });
        }

        process.exit(result.valid ? 0 : 1);
    } else {
        console.log('Usage:');
        console.log('  node validate-benchmark.js              # Validate all submissions');
        console.log('  node validate-benchmark.js --file PATH  # Validate single file');
        process.exit(1);
    }
}

module.exports = {
    validateBenchmarkFile,
    validateAllBenchmarks,
    checkDuplicates
};
