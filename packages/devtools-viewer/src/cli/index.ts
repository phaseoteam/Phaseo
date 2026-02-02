#!/usr/bin/env node

import { startServer } from "../server/index.js";
import * as path from "path";
import * as process from "process";

const args = process.argv.slice(2);
const command = args[0] || "start";

function printHelp() {
  console.log(`
AI Stats DevTools Viewer

Usage:
  ai-stats-devtools [command] [options]

Commands:
  start              Start the devtools viewer server (default)
  help               Show this help message

Options:
  -p, --port <port>  Port to run the server on (default: 4983)
  -d, --dir <path>   Path to devtools directory (default: .ai-stats-devtools)
  -h, --help         Show this help message

Examples:
  ai-stats-devtools start
  ai-stats-devtools start -p 3000
  ai-stats-devtools start -d /path/to/devtools
  ai-stats-devtools --port 8080 --dir ./my-devtools

Environment Variables:
  AI_STATS_DEVTOOLS_DIR  Path to devtools directory
  PORT                   Port to run the server on
`);
}

function parseArgs() {
  const config = {
    port: parseInt(process.env.PORT || "4983", 10),
    directory: process.env.AI_STATS_DEVTOOLS_DIR || ".ai-stats-devtools"
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "-p" || arg === "--port") {
      config.port = parseInt(args[++i], 10);
      if (isNaN(config.port)) {
        console.error("Error: Port must be a number");
        process.exit(1);
      }
    }

    if (arg === "-d" || arg === "--dir" || arg === "--directory") {
      config.directory = args[++i];
      if (!config.directory) {
        console.error("Error: Directory path is required");
        process.exit(1);
      }
    }
  }

  return config;
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "start" || !command || command.startsWith("-")) {
    const config = parseArgs();

    // Set environment variables for the server
    process.env.AI_STATS_DEVTOOLS_DIR = config.directory;
    process.env.PORT = config.port.toString();

    startServer(config.port);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run "ai-stats-devtools help" for usage information');
  process.exit(1);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
