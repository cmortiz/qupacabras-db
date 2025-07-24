#!/usr/bin/env node

/**
 * Script to analyze QASM files and extract quantum circuit properties
 * Usage: node analyze-qasm.js <path-to-qasm-file>
 */

const fs = require('fs');
const path = require('path');

function analyzeQASMFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('//'));
        
        const analysis = {
            qubitCount: 0,
            classicalBitCount: 0,
            gateCount: 0,
            singleQubitGateCount: 0,
            twoQubitGateCount: 0,
            multiQubitGateCount: 0,
            measurementCount: 0,
            circuitDepth: 0,
            gateTypes: {},
            hasBarrier: false
        };
        
        // Track qubit usage for depth calculation
        const qubitLastUse = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip includes and version
            if (trimmed.startsWith('OPENQASM') || trimmed.startsWith('include')) {
                continue;
            }
            
            // Parse quantum register declaration
            if (trimmed.startsWith('qreg')) {
                const match = trimmed.match(/qreg\s+\w+\[(\d+)\]/);
                if (match) {
                    analysis.qubitCount += parseInt(match[1]);
                }
                continue;
            }
            
            // Parse classical register declaration
            if (trimmed.startsWith('creg')) {
                const match = trimmed.match(/creg\s+\w+\[(\d+)\]/);
                if (match) {
                    analysis.classicalBitCount += parseInt(match[1]);
                }
                continue;
            }
            
            // Parse measurement
            if (trimmed.includes('measure')) {
                analysis.measurementCount++;
                continue;
            }
            
            // Parse barrier
            if (trimmed.startsWith('barrier')) {
                analysis.hasBarrier = true;
                continue;
            }
            
            // Parse gates (including gates with parameters)
            const gateMatch = trimmed.match(/^(\w+)(\([^)]*\))?\s+(.+);?$/);
            if (gateMatch) {
                const gateName = gateMatch[1];
                const gateArgs = gateMatch[3];
                
                // Count gate type
                analysis.gateTypes[gateName] = (analysis.gateTypes[gateName] || 0) + 1;
                analysis.gateCount++;
                
                // Determine gate type by counting qubits involved
                const qubitMatches = gateArgs.match(/q\[\d+\]/g) || [];
                const numQubits = qubitMatches.length;
                
                if (numQubits === 1) {
                    analysis.singleQubitGateCount++;
                } else if (numQubits === 2) {
                    analysis.twoQubitGateCount++;
                } else if (numQubits > 2) {
                    analysis.multiQubitGateCount++;
                }
                
                // Update circuit depth (simplified - tracks max depth per qubit)
                for (const qubit of qubitMatches) {
                    const currentDepth = (qubitLastUse[qubit] || 0) + 1;
                    qubitLastUse[qubit] = currentDepth;
                    analysis.circuitDepth = Math.max(analysis.circuitDepth, currentDepth);
                }
            }
        }
        
        return analysis;
    } catch (error) {
        console.error(`Error analyzing QASM file: ${error.message}`);
        return null;
    }
}

function analyzeDirectory(dirPath) {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.qasm'));
    const analyses = [];
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const analysis = analyzeQASMFile(filePath);
        if (analysis) {
            analyses.push({ file, ...analysis });
        }
    }
    
    // Aggregate statistics
    if (analyses.length > 0) {
        const aggregate = {
            totalCircuits: analyses.length,
            avgQubitCount: analyses.reduce((sum, a) => sum + a.qubitCount, 0) / analyses.length,
            avgGateCount: analyses.reduce((sum, a) => sum + a.gateCount, 0) / analyses.length,
            avgCircuitDepth: analyses.reduce((sum, a) => sum + a.circuitDepth, 0) / analyses.length,
            avgSingleQubitGates: analyses.reduce((sum, a) => sum + a.singleQubitGateCount, 0) / analyses.length,
            avgTwoQubitGates: analyses.reduce((sum, a) => sum + a.twoQubitGateCount, 0) / analyses.length,
            totalGateTypes: {}
        };
        
        // Aggregate gate types
        for (const analysis of analyses) {
            for (const [gate, count] of Object.entries(analysis.gateTypes)) {
                aggregate.totalGateTypes[gate] = (aggregate.totalGateTypes[gate] || 0) + count;
            }
        }
        
        return { analyses, aggregate };
    }
    
    return null;
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node analyze-qasm.js <path-to-qasm-file-or-directory>');
        process.exit(1);
    }
    
    const targetPath = args[0];
    const stats = fs.statSync(targetPath);
    
    if (stats.isDirectory()) {
        console.log(`\n📊 Analyzing QASM files in directory: ${targetPath}\n`);
        const result = analyzeDirectory(targetPath);
        if (result) {
            console.log('📈 Aggregate Statistics:');
            console.log(`   Total circuits: ${result.aggregate.totalCircuits}`);
            console.log(`   Average qubits: ${result.aggregate.avgQubitCount.toFixed(1)}`);
            console.log(`   Average gates: ${result.aggregate.avgGateCount.toFixed(1)}`);
            console.log(`   Average depth: ${result.aggregate.avgCircuitDepth.toFixed(1)}`);
            console.log(`   Average 1Q gates: ${result.aggregate.avgSingleQubitGates.toFixed(1)}`);
            console.log(`   Average 2Q gates: ${result.aggregate.avgTwoQubitGates.toFixed(1)}`);
            console.log('\n🔧 Gate Types Used:');
            for (const [gate, count] of Object.entries(result.aggregate.totalGateTypes)) {
                console.log(`   ${gate}: ${count} total (${(count / result.aggregate.totalCircuits).toFixed(1)} avg)`);
            }
        }
    } else {
        console.log(`\n📊 Analyzing QASM file: ${targetPath}\n`);
        const analysis = analyzeQASMFile(targetPath);
        if (analysis) {
            console.log('📈 Circuit Analysis:');
            console.log(`   Qubits: ${analysis.qubitCount}`);
            console.log(`   Classical bits: ${analysis.classicalBitCount}`);
            console.log(`   Total gates: ${analysis.gateCount}`);
            console.log(`   Circuit depth: ${analysis.circuitDepth}`);
            console.log(`   Single-qubit gates: ${analysis.singleQubitGateCount}`);
            console.log(`   Two-qubit gates: ${analysis.twoQubitGateCount}`);
            console.log(`   Measurements: ${analysis.measurementCount}`);
            console.log('\n🔧 Gate Breakdown:');
            for (const [gate, count] of Object.entries(analysis.gateTypes)) {
                console.log(`   ${gate}: ${count}`);
            }
        }
    }
}

module.exports = { analyzeQASMFile, analyzeDirectory };