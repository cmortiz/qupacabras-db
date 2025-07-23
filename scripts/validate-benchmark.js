#!/usr/bin/env node

/**
 * Benchmark validation utility using JSON Schema
 * Can be used for CI/CD, pre-commit hooks, and CLI validation
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize AJV with all formats
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// Load the schema
const schemaPath = path.join(__dirname, '../schemas/benchmark-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Compile the validation function
const validate = ajv.compile(schema);

/**
 * Validates a single benchmark.json file
 * @param {string} benchmarkPath - Path to the benchmark.json file
 * @param {string} folderName - Name of the submission folder
 * @returns {Object} Validation result with errors array
 */
function validateBenchmarkFile(benchmarkPath, folderName) {
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
        
        // Check if ID matches folder name
        if (benchmarkData.id !== folderName) {
            result.valid = false;
            result.errors.push({
                field: 'id',
                message: `ID '${benchmarkData.id}' must match folder name '${folderName}'`
            });
        }
        
        // Validate QASM files exist
        if (benchmarkData.qasmFiles && Array.isArray(benchmarkData.qasmFiles)) {
            const folderPath = path.dirname(benchmarkPath);
            benchmarkData.qasmFiles.forEach(qasmFile => {
                const qasmPath = path.join(folderPath, qasmFile);
                if (!fs.existsSync(qasmPath)) {
                    result.valid = false;
                    result.errors.push({
                        field: 'qasmFiles',
                        message: `QASM file '${qasmFile}' not found`
                    });
                } else {
                    // Validate QASM content
                    const qasmContent = fs.readFileSync(qasmPath, 'utf8');
                    if (!validateQASMContent(qasmContent)) {
                        result.warnings.push({
                            field: 'qasmFiles',
                            message: `${qasmFile} may not be valid QASM (missing standard headers)`
                        });
                    }
                }
            });
        }
        
        // Quantum-specific validations
        if (benchmarkData.quantumSpecific) {
            const qs = benchmarkData.quantumSpecific;
            
            // Validate circuit depth vs gate count
            if (qs.circuitDepth !== undefined && qs.gateCount !== undefined) {
                if (qs.circuitDepth > qs.gateCount) {
                    result.warnings.push({
                        field: 'quantumSpecific',
                        message: 'Circuit depth cannot exceed total gate count'
                    });
                }
            }
            
            // Validate two-qubit gates vs total gates
            if (qs.twoQubitGateCount !== undefined && qs.gateCount !== undefined) {
                if (qs.twoQubitGateCount > qs.gateCount) {
                    result.warnings.push({
                        field: 'quantumSpecific.twoQubitGateCount',
                        message: 'Two-qubit gate count cannot exceed total gate count'
                    });
                }
            }
        }
        
        // Statistical value validations
        if (benchmarkData.errorRates) {
            const errorTypes = ['qubit', 'readout', 'twoQubitGate', 'singleQubitGate'];
            errorTypes.forEach(errorType => {
                if (benchmarkData.errorRates[errorType]) {
                    const stats = benchmarkData.errorRates[errorType];
                    validateStatisticalConsistency(stats, `errorRates.${errorType}`, result);
                }
            });
        }
        
        if (benchmarkData.executionTime) {
            const stats = benchmarkData.executionTime;
            validateStatisticalConsistency(stats, 'executionTime', result, false);
        }
        
        // Check for recommended fields
        if (!benchmarkData.uncertainty) {
            result.warnings.push({
                field: 'uncertainty',
                message: 'Consider adding uncertainty/error bars for the metric'
            });
        }
        
        if (!benchmarkData.quantumSpecific) {
            result.warnings.push({
                field: 'quantumSpecific',
                message: 'Consider adding quantum-specific properties (qubit count, gate count, etc.)'
            });
        }
        
        // Note: errorRates and executionTime are optional fields, no warnings needed
        
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
 * Check for duplicate submissions
 */
function checkDuplicates(allBenchmarks) {
    const duplicates = [];
    const seen = new Map();
    
    allBenchmarks.forEach((benchmark, index) => {
        // Create a signature for comparison
        const signature = `${benchmark.algorithmName}-${benchmark.device}-${benchmark.metricName}`;
        
        if (seen.has(signature)) {
            const existing = seen.get(signature);
            // Check if values are suspiciously similar
            if (Math.abs(benchmark.metricValue - existing.metricValue) < 0.0001) {
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
    const duplicates = checkDuplicates(allBenchmarks);
    
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