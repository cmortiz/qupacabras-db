#!/usr/bin/env node

/**
 * Script to automatically generate benchmark index from submissions folder
 * This runs during the build process to create public/benchmarks.json
 */

const fs = require('fs');
const path = require('path');

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
            try {
                const benchmarkData = JSON.parse(fs.readFileSync(benchmarkJsonPath, 'utf8'));
                
                // Validate required fields
                const requiredFields = ['id', 'algorithmName', 'team', 'device', 'metricName', 'metricValue', 'timestamp'];
                const missingFields = requiredFields.filter(field => !benchmarkData[field]);
                
                if (missingFields.length > 0) {
                    console.warn(`⚠️  ${folder}: Missing required fields: ${missingFields.join(', ')}`);
                    continue;
                }
                
                // Ensure benchmarkFolder matches the actual folder name
                benchmarkData.benchmarkFolder = folder;
                
                // Parse timestamp to ensure it's valid
                benchmarkData.timestamp = new Date(benchmarkData.timestamp).toISOString();
                
                benchmarks.push(benchmarkData);
                console.log(`✅ Added benchmark: ${benchmarkData.algorithmName} (${folder})`);
                
            } catch (error) {
                console.error(`❌ Error processing ${folder}/benchmark.json:`, error.message);
            }
        } else {
            console.warn(`⚠️  ${folder}: No benchmark.json found`);
        }
    }

    // Sort benchmarks by timestamp (newest first)
    benchmarks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the index file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(benchmarks, null, 2));
    console.log(`🎉 Generated benchmarks.json with ${benchmarks.length} benchmarks`);
    
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