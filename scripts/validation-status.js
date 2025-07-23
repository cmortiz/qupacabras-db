#!/usr/bin/env node

/**
 * Generate a validation status report for the README
 */

const { validateAllBenchmarks } = require('./validate-benchmark');
const path = require('path');

const submissionsDir = path.join(__dirname, '../submissions');
const { results, duplicates, allValid } = validateAllBenchmarks(submissionsDir);

const validCount = results.filter(r => r.valid).length;
const totalCount = results.length;

console.log('\n## Validation Status\n');
console.log(`✅ **${validCount}/${totalCount}** submissions pass validation`);
console.log(`🔍 **${duplicates.length}** potential duplicates detected`);

if (!allValid) {
    console.log('\n### Failed Validations:');
    results.filter(r => !r.valid).forEach(result => {
        console.log(`- ❌ \`${result.folder}\``);
    });
}

if (duplicates.length > 0) {
    console.log('\n### Potential Duplicates:');
    duplicates.forEach(dup => {
        console.log(`- ⚠️ \`${dup.current}\` may duplicate \`${dup.existing}\``);
    });
}