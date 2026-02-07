#!/usr/bin/env node
/**
 * Parallel Test Runner for AI Stats Project
 * Tests all SDKs, AI SDK, and Devtools in parallel
 * Outputs a beautiful results table
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

// Test configurations for each package
const testConfigs = [
    // AI SDK
    {
        name: 'AI SDK (ai-sdk-ai-stats)',
        path: 'packages/integrations/ai-sdk-ai-stats',
        command: 'pnpm',
        args: ['run', 'test'],
        timeout: 60000,
    },

    // Devtools
    {
        name: 'Devtools Core',
        path: 'packages/devtools/devtools-core',
        command: 'pnpm',
        args: ['run', 'test'],
        timeout: 60000,
    },
    {
        name: 'Devtools Viewer',
        path: 'packages/devtools/devtools-viewer',
        command: 'pnpm',
        args: ['run', 'test'],
        timeout: 60000,
    },

    // TypeScript SDK
    {
        name: 'SDK TypeScript',
        path: 'packages/sdk/sdk-ts',
        command: 'pnpm',
        args: ['run', 'smoke:responses'],
        timeout: 30000,
    },

    // Python SDK
    {
        name: 'SDK Python',
        path: 'packages/sdk/sdk-py',
        command: 'python',
        args: ['-m', 'pytest', '-v', 'tests/'],
        timeout: 60000,
        skipIfNoCommand: true,
        env: {
            PYTHONPATH: 'src',
        },
    },

    // Go SDK
    {
        name: 'SDK Go',
        path: 'packages/sdk/sdk-go',
        command: 'go',
        args: ['test', '-v', './...'],
        timeout: 60000,
        skipIfNoCommand: true,
    },

    // C++ SDK (if g++ is available)
    {
        name: 'SDK C++',
        path: 'packages/sdk/sdk-cpp',
        command: 'pnpm',
        args: ['run', 'smoke:chat'],
        timeout: 60000,
        skipIfNoCommand: true,
        requiredCommand: 'g++',
    },

    // Rust SDK
    {
        name: 'SDK Rust',
        path: 'packages/sdk/sdk-rust',
        command: 'cargo',
        args: ['test'],
        timeout: 120000,
        skipIfNoCommand: true,
    },

    // C# SDK (if dotnet is available)
    {
        name: 'SDK C#',
        path: 'packages/sdk/sdk-csharp',
        command: 'pnpm',
        args: ['run', 'smoke:responses'],
        timeout: 60000,
        skipIfNoCommand: true,
        requiredCommand: 'dotnet',
    },

    // Java SDK (if maven is available)
    {
        name: 'SDK Java',
        path: 'packages/sdk/sdk-java',
        command: 'mvn',
        args: ['test'],
        timeout: 120000,
        skipIfNoCommand: true,
    },

    // PHP SDK (if phpunit is available)
    {
        name: 'SDK PHP',
        path: 'packages/sdk/sdk-php',
        command: 'php',
        args: ['vendor/bin/phpunit', 'tests'],
        timeout: 60000,
        skipIfNoCommand: true,
        requiredCommand: 'php',
        localBinary: 'vendor/bin/phpunit',
    },

    // Ruby SDK (if rspec is available)
    {
        name: 'SDK Ruby',
        path: 'packages/sdk/sdk-ruby',
        command: 'ruby',
        args: ['smoke.rb'],
        timeout: 60000,
        skipIfNoCommand: true,
    },
];

const cliArgs = process.argv.slice(2);
const sdkOnly = cliArgs.includes("--sdks");
const effectiveConfigs = sdkOnly
    ? testConfigs.filter((config) => config.name.startsWith("SDK "))
    : testConfigs;

// Check if command exists
function commandExists(command) {
    return new Promise((resolve) => {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const proc = spawn(locator, [command], { shell: true });
        proc.on('close', (code) => resolve(code === 0));
    });
}

// Run a single test
async function runTest(config) {
    const fullPath = join(__dirname, config.path);

    // Check if path exists
    if (!existsSync(fullPath)) {
        return {
            name: config.name,
            status: 'SKIP',
            reason: 'Path not found',
            duration: 0,
        };
    }

    // Check if command exists (for non-npm commands)
    if (config.localBinary) {
        const localPath = join(fullPath, config.localBinary);
        if (!existsSync(localPath)) {
            return {
                name: config.name,
                status: 'SKIP',
                reason: `${config.localBinary} not installed`,
                duration: 0,
            };
        }
    }

    if (config.skipIfNoCommand) {
        const requiredCommand = config.requiredCommand || config.command;
        const exists = await commandExists(requiredCommand);
        if (!exists) {
            return {
                name: config.name,
                status: 'SKIP',
                reason: `${requiredCommand} not installed`,
                duration: 0,
            };
        }
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
        const proc = spawn(config.command, config.args, {
            cwd: fullPath,
            shell: true,
            env: {
                ...process.env,
                ...(config.env || {}),
            },
            stdio: 'pipe',
        });

        let output = '';
        let errorOutput = '';

        proc.stdout?.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            errorOutput += data.toString();
        });

        // Timeout handler
        const timeout = setTimeout(() => {
            proc.kill();
            resolve({
                name: config.name,
                status: 'TIMEOUT',
                reason: `Exceeded ${config.timeout}ms`,
                duration: Date.now() - startTime,
                output: output + errorOutput,
            });
        }, config.timeout);

        proc.on('close', (code) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;

            resolve({
                name: config.name,
                status: code === 0 ? 'PASS' : 'FAIL',
                reason: code === 0 ? '' : `Exit code ${code}`,
                duration,
                output: output + errorOutput,
            });
        });

        proc.on('error', (error) => {
            clearTimeout(timeout);
            resolve({
                name: config.name,
                status: 'ERROR',
                reason: error.message,
                duration: Date.now() - startTime,
                output: errorOutput,
            });
        });
    });
}

// Format duration
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

// Print table
function printTable(results) {
    const maxNameLength = Math.max(...results.map(r => r.name.length), 20);
    const maxReasonLength = Math.max(...results.map(r => r.reason.length), 30);

    const header = `+${'-'.repeat(maxNameLength + 2)}+${'-'.repeat(8)}+${'-'.repeat(10)}+${'-'.repeat(maxReasonLength + 2)}+`;

    console.log('\n' + colors.bright + colors.blue + header + colors.reset);
    console.log(
        colors.bright +
        `| ${'Test'.padEnd(maxNameLength)} | Status | Duration | ${'Reason'.padEnd(maxReasonLength)} |` +
        colors.reset
    );
    console.log(colors.blue + header + colors.reset);

    for (const result of results) {
        const statusColor =
            result.status === 'PASS' ? colors.green :
            result.status === 'SKIP' ? colors.yellow :
            result.status === 'TIMEOUT' ? colors.yellow :
            colors.red;

        const name = result.name.padEnd(maxNameLength);
        const status = result.status.padEnd(6);
        const duration = formatDuration(result.duration).padEnd(8);
        const reason = result.reason.padEnd(maxReasonLength);

        console.log(
            `| ${name} | ${statusColor}${status}${colors.reset} | ${duration} | ${colors.dim}${reason}${colors.reset} |`
        );
    }

    console.log(colors.blue + header + colors.reset);
}

// Print summary
function printSummary(results) {
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;
    const errors = results.filter(r => r.status === 'ERROR').length;
    const timeouts = results.filter(r => r.status === 'TIMEOUT').length;
    const total = results.length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n' + colors.bright + colors.cyan + '='.repeat(60) + colors.reset);
    console.log(colors.bright + 'SUMMARY' + colors.reset);
    console.log(colors.cyan + '='.repeat(60) + colors.reset);
    console.log(`${colors.green}[OK] Passed:${colors.reset}  ${passed}/${total}`);
    console.log(`${colors.red}[FAIL] Failed:${colors.reset}  ${failed}/${total}`);
    console.log(`${colors.yellow}[SKIP] Skipped:${colors.reset} ${skipped}/${total}`);
    if (errors > 0) console.log(`${colors.red}[ERROR] Errors:${colors.reset}  ${errors}/${total}`);
    if (timeouts > 0) console.log(`${colors.yellow}[TIMEOUT] Timeouts:${colors.reset} ${timeouts}/${total}`);
    console.log(`${colors.blue}[TIME] Total time:${colors.reset} ${formatDuration(totalDuration)}`);
    console.log(colors.cyan + '='.repeat(60) + colors.reset + '\n');

    return failed === 0 && errors === 0 && timeouts === 0;
}

// Main function
async function main() {
    console.log(colors.bright + colors.blue);
    console.log('============================================================');
    console.log('     AI Stats Parallel Test Runner');
    console.log('     Testing All SDKs, AI SDK, and Devtools');
    console.log('============================================================');
    console.log(colors.reset);

    console.log(`\n${colors.cyan}Running ${effectiveConfigs.length} test suites in parallel...${colors.reset}\n`);

    const startTime = Date.now();

    // Run all tests in parallel
    const results = await Promise.all(effectiveConfigs.map(runTest));

    const totalTime = Date.now() - startTime;

    // Print results table
    printTable(results);

    // Print summary
    const allPassed = printSummary(results);

    // Print failed test details
    const failedTests = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
    if (failedTests.length > 0) {
        console.log(colors.red + colors.bright + '\nFailed Tests Details:' + colors.reset);
        console.log(colors.red + '-'.repeat(60) + colors.reset);
        for (const test of failedTests) {
            console.log(`\n${colors.bright}${test.name}:${colors.reset}`);
            console.log(colors.dim + test.output.slice(-500) + colors.reset); // Last 500 chars
        }
    }

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
    console.error(colors.red + 'Fatal error:' + colors.reset, error);
    process.exit(1);
});

