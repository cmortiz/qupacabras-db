#!/usr/bin/env node

/**
 * Script to add contributor field to benchmark.json files
 * Used by GitHub Actions to auto-populate PR author
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node add-contributor.js <file-path> <contributor-username>');
    process.exit(1);
}

const [filePath, contributor] = args;

try {
    // Read the benchmark file
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Check if contributor already exists
    if (data.contributor) {
        console.log(`Contributor already exists: ${data.contributor}`);
        process.exit(0);
    }
    
    // Add contributor field
    data.contributor = contributor;
    
    // Write back with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    
    console.log(`✅ Added contributor '${contributor}' to ${filePath}`);
    process.exit(0);
    
} catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    process.exit(1);
}