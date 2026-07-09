#!/usr/bin/env node

/**
 * Post-install script for @phaseo/sdk
 *
 * Prompts users to optionally install @phaseo/devtools-viewer
 * for debugging and monitoring their AI applications.
 */

const readline = require('readline');
const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

// Skip in CI environments or when publishing
const isCI = process.env.CI === 'true' ||
             process.env.CONTINUOUS_INTEGRATION === 'true' ||
             process.env.GITHUB_ACTIONS === 'true' ||
             process.env.GITLAB_CI === 'true' ||
             process.env.CIRCLECI === 'true';

const isPublishing = process.env.npm_config_global === 'true' ||
                     process.env.npm_lifecycle_event === 'publish' ||
                     process.env.npm_lifecycle_event === 'prepublishOnly';

// Allow skipping via environment variable
const skipPostInstall = process.env.PHASEO_SKIP_POSTINSTALL === 'true';

// Allow auto-install/skip via environment variable
const autoInstall = process.env.PHASEO_INSTALL_VIEWER === 'true';
const autoSkip = process.env.PHASEO_INSTALL_VIEWER === 'false';

// Skip if already installed (in workspace context)
const viewerInstalled = existsSync(path.join(__dirname, '../../../devtools/devtools-viewer'));

if (isCI || isPublishing || skipPostInstall || viewerInstalled) {
  process.exit(0);
}

// Detect package manager
function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || '';

  if (userAgent.includes('pnpm')) return 'pnpm';
  if (userAgent.includes('yarn')) return 'yarn';
  return 'npm';
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m'
};

// Ask user if they want to install devtools viewer
function askQuestion() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n' + colors.cyan + colors.bright + '🎯 Phaseo Devtools' + colors.reset);
    console.log(colors.dim + '━'.repeat(60) + colors.reset);
    console.log('');
    console.log('Install the ' + colors.bright + 'devtools viewer' + colors.reset + ' to debug your API requests?');
    console.log('');
    console.log(colors.dim + 'What you get:' + colors.reset);
    console.log('  • Real-time dashboard with live updates');
    console.log('  • Cost tracking and usage analytics');
    console.log('  • Error debugging with solutions');
    console.log('  • Export to JSON/CSV');
    console.log('');
    console.log(colors.dim + 'You can install it later with: npx @phaseo/devtools-viewer' + colors.reset);
    console.log('');

    const promptUser = () => {
      rl.question(
        colors.bright + '? Install devtools viewer? [Y/n]: ' + colors.reset,
        (answer) => {
          const normalized = answer.toLowerCase().trim();

          if (normalized === '' || normalized === 'y' || normalized === 'yes') {
            rl.close();
            resolve(true);
          } else if (normalized === 'n' || normalized === 'no') {
            rl.close();
            resolve(false);
          } else {
            // Invalid input - ask again
            console.log(colors.yellow + '  Please enter Y for yes or n for no' + colors.reset);
            promptUser();
          }
        }
      );
    };

    promptUser();
  });
}

// Install the devtools viewer
function installViewer(packageManager) {
  return new Promise((resolve, reject) => {
    console.log('');
    console.log(colors.cyan + '📦 Installing @phaseo/devtools-viewer...' + colors.reset);
    console.log('');

    const commands = {
      npm: ['install', '--save-dev', '@phaseo/devtools-viewer'],
      pnpm: ['add', '-D', '@phaseo/devtools-viewer'],
      yarn: ['add', '-D', '@phaseo/devtools-viewer']
    };

    const args = commands[packageManager];
    const child = spawn(packageManager, args, {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// Main execution
async function main() {
  try {
    // Handle auto-install/skip
    let shouldInstall;
    if (autoInstall) {
      shouldInstall = true;
      console.log('');
      console.log(colors.cyan + '🚀 Auto-installing devtools viewer...' + colors.reset);
    } else if (autoSkip) {
      shouldInstall = false;
      console.log('');
      console.log(colors.dim + '⏭️  Skipping devtools viewer install (PHASEO_INSTALL_VIEWER=false)' + colors.reset);
      console.log('');
      process.exit(0);
    } else {
      shouldInstall = await askQuestion();
    }

    if (shouldInstall) {
      const packageManager = detectPackageManager();
      await installViewer(packageManager);

      console.log('');
      console.log(colors.green + '✅ Devtools viewer installed!' + colors.reset);
      console.log('');
      console.log(colors.bright + 'Quick start:' + colors.reset);
      console.log('');
      console.log('1. Enable devtools:');
      console.log(colors.dim + '   const client = new Phaseo({' + colors.reset);
      console.log(colors.dim + '     devtools: createPhaseoDevtools()' + colors.reset);
      console.log(colors.dim + '   });' + colors.reset);
      console.log('');
      console.log('2. View your requests:');
      console.log(colors.dim + '   npx @phaseo/devtools-viewer' + colors.reset);
      console.log('');
      console.log(colors.cyan + '📖 Docs: https://docs.phaseo.org/devtools' + colors.reset);
      console.log('');
    } else {
      console.log('');
      console.log(colors.dim + '⏭️  Skipped. Install later with:' + colors.reset);
      console.log(colors.dim + '   npm install -D @phaseo/devtools-viewer' + colors.reset);
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    // Non-blocking - don't fail the install if this script has issues
    console.error('');
    console.error(colors.yellow + '⚠️  Note: Could not prompt for devtools viewer.' + colors.reset);
    console.error(colors.dim + '   Install manually with: npm install -D @phaseo/devtools-viewer' + colors.reset);
    console.error('');
    process.exit(0); // Exit successfully to not block install
  }
}

main();
