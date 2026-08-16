#!/usr/bin/env node

/**
 * Regenerate `public/benchmarks.json` and check that the result is usable.
 *
 * This is the same code path the deploy build runs, so a submission that would stop the deploy
 * stops here too, earlier and with the same message. It replaces a shell block that piped the
 * generator's output through `grep` and the index through `jq`; neither tool is needed, and
 * neither is guaranteed on a runner.
 *
 * The generator runs as a child process rather than in-process. Under the `enforce` policy it
 * throws before writing, and a throw is easier to read as a child's exit status than as a stack
 * unwinding through this script.
 *
 * Duplicate detection stays a warning here, matching the generator: two teams playing the same
 * game on the same device legitimately land on near-identical numbers.
 *
 * Usage:
 *   node scripts/ci/check-index.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-benchmark-index.js');
const INDEX_FILE = path.join(REPO_ROOT, 'public', 'benchmarks.json');

/** Marker the generator prints when it finds near-identical submissions. */
const DUPLICATE_MARKER = 'Potential duplicates detected';

/**
 * Run the generator, returning its combined output and whether it succeeded.
 *
 * @returns {{ok: boolean, output: string}} Outcome and everything the generator printed.
 */
function runGenerator() {
    try {
        const output = execFileSync(process.execPath, [GENERATOR], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { ok: true, output: output };
    } catch (error) {
        const stdout = error.stdout ? String(error.stdout) : '';
        const stderr = error.stderr ? String(error.stderr) : String(error.message);
        return { ok: false, output: `${stdout}${stderr}` };
    }
}

/**
 * Entry point.
 *
 * @returns {number} Process exit code.
 */
function main() {
    console.log('🔧 Regenerating the benchmark index...\n');

    const generated = runGenerator();
    console.log(generated.output);

    if (!generated.ok) {
        console.error('❌ The benchmark index generator failed, so the index was not rewritten.');
        console.error('   The published site keeps its last good index until this passes.');
        return 1;
    }

    let raw;
    try {
        raw = fs.readFileSync(INDEX_FILE, 'utf8');
    } catch (error) {
        console.error(`❌ ${INDEX_FILE} was not written: ${error.message}`);
        return 1;
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.error(`❌ ${INDEX_FILE} is not valid JSON: ${error.message}`);
        return 1;
    }

    if (!Array.isArray(parsed)) {
        console.error(`❌ ${INDEX_FILE} is valid JSON but not an array of benchmarks.`);
        return 1;
    }

    if (generated.output.indexOf(DUPLICATE_MARKER) !== -1) {
        console.warn('⚠️  Potential duplicate submissions were reported above. Review them, but ' +
            'note that this is a warning and not a failure.');
    }

    console.log(`✅ Benchmark index generated: ${parsed.length} entries, valid JSON.`);
    return 0;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = { runGenerator, main };
