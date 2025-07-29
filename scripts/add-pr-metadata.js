#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Add contributor and timestamp to benchmark.json if they don't exist
 * 
 * Usage: node add-pr-metadata.js <file-path> <contributor> <timestamp>
 */

const args = process.argv.slice(2);
if (args.length !== 3) {
    console.error('Usage: node add-pr-metadata.js <file-path> <contributor> <timestamp>');
    process.exit(1);
}

const [filePath, contributor, timestamp] = args;

// Validate file exists
if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
}

try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse JSON
    const data = JSON.parse(content);
    
    let modified = false;
    
    // Add contributor if it doesn't exist
    if (!data.contributor) {
        data.contributor = contributor;
        console.log(`✅ Added contributor: ${contributor}`);
        modified = true;
    } else {
        console.log(`ℹ️  Contributor already exists: ${data.contributor}`);
    }
    
    // Add timestamp if it doesn't exist
    if (!data.timestamp) {
        data.timestamp = timestamp;
        console.log(`✅ Added timestamp: ${timestamp}`);
        modified = true;
    } else {
        console.log(`ℹ️  Timestamp already exists: ${data.timestamp}`);
    }
    
    // Write back only if modified
    if (modified) {
        // Pretty print with 2 spaces
        const updatedContent = JSON.stringify(data, null, 2) + '\n';
        fs.writeFileSync(filePath, updatedContent);
        console.log(`✅ Updated ${filePath}`);
    } else {
        console.log(`ℹ️  No changes needed for ${filePath}`);
    }
    
    // Exit with success
    process.exit(0);
    
} catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    process.exit(1);
}