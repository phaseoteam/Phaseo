#!/usr/bin/env node

/**
 * Dev server starter for AI Stats Devtools
 * Starts both the API server and UI dev server reliably on all platforms
 */

import { spawn } from 'child_process';
import { createServer } from 'net';

const API_PORT = 4984;
const UI_PORT = 4983;
const MAX_WAIT = 30000; // 30 seconds

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(true); // Other error, assume available
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });
    server.listen(port);
  });
}

function waitForPort(port, timeout = MAX_WAIT) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = 100; // Check every 100ms

    const check = () => {
      const server = createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use, which means server is ready!
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, interval);
        }
      });
      server.once('listening', () => {
        server.close();
        // Port is available, server not ready yet
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, interval);
        }
      });
      server.listen(port);
    };

    check();
  });
}

async function main() {
  console.log('\n' + colors.cyan + '🚀 Starting AI Stats Devtools Development Environment' + colors.reset + '\n');

  // Check if ports are available
  log(colors.blue, 'CHECK', `Checking if ports ${API_PORT} and ${UI_PORT} are available...`);

  const apiPortFree = await checkPort(API_PORT);
  const uiPortFree = await checkPort(UI_PORT);

  if (!apiPortFree) {
    log(colors.red, 'ERROR', `Port ${API_PORT} is already in use!`);
    log(colors.yellow, 'TIP', `Kill the process with: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${API_PORT}).OwningProcess`);
    process.exit(1);
  }

  if (!uiPortFree) {
    log(colors.red, 'ERROR', `Port ${UI_PORT} is already in use!`);
    log(colors.yellow, 'TIP', `Kill the process with: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${UI_PORT}).OwningProcess`);
    process.exit(1);
  }

  log(colors.green, 'OK', 'Ports are available');

  // Start API server
  log(colors.blue, 'SERVER', `Starting API server on port ${API_PORT}...`);

  const serverArgs = ['exec', 'tsx', 'watch', 'src/server/index.ts', '--', '--start', '--port', String(API_PORT), '--dir', '../../../.ai-stats-devtools'];
  const serverProcess = spawn('pnpm', serverArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Forward server output with prefix
  serverProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(colors.magenta, 'SERVER', line));
  });

  serverProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(colors.red, 'SERVER', line));
  });

  serverProcess.on('exit', (code) => {
    log(colors.red, 'SERVER', `Exited with code ${code}`);
    process.exit(code || 0);
  });

  // Wait for server to be ready
  try {
    log(colors.blue, 'SERVER', 'Waiting for API server to be ready...');
    await waitForPort(API_PORT);
    log(colors.green, 'SERVER', `API server ready at http://localhost:${API_PORT}`);
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    serverProcess.kill();
    process.exit(1);
  }

  // Start UI dev server
  log(colors.blue, 'UI', `Starting Vite dev server on port ${UI_PORT}...`);

  const uiArgs = ['exec', 'vite', '--port', String(UI_PORT)];
  const uiProcess = spawn('pnpm', uiArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Forward UI output with prefix
  uiProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(colors.cyan, 'UI', line));
  });

  uiProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(colors.red, 'UI', line));
  });

  uiProcess.on('exit', (code) => {
    log(colors.red, 'UI', `Exited with code ${code}`);
    serverProcess.kill();
    process.exit(code || 0);
  });

  // Wait a bit for UI to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n' + colors.green + '✅ Development servers started!' + colors.reset);
  console.log(colors.cyan + `\n   🌐 Open http://localhost:${UI_PORT} in your browser\n` + colors.reset);
  console.log(colors.yellow + '   Press Ctrl+C to stop both servers\n' + colors.reset);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    log(colors.yellow, 'SHUTDOWN', 'Stopping servers...');
    serverProcess.kill();
    uiProcess.kill();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(colors.red + 'Fatal error:' + colors.reset, error);
  process.exit(1);
});
