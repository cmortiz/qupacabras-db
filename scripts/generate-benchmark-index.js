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

function generateBenchmarkIndex() {
    console.log('🔍 Scanning submissions directory...');
    
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
                    if (benchmarkData.qasmFiles && benchmarkData.qasmFiles.length > 0) {
                        console.log(`   📊 Analyzing QASM files for ${folder}...`);
                        let totalAnalysis = null;
                        let fileCount = 0;
                        
                        for (const qasmFile of benchmarkData.qasmFiles) {
                            const qasmPath = path.join(folderPath, qasmFile);
                            if (fs.existsSync(qasmPath)) {
                                const analysis = analyzeQASMFile(qasmPath);
                                if (analysis) {
                                    fileCount++;
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
                        }
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