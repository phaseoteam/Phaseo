import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = ['exec', 'vitest', 'run', 'tests/gateway-integration.test.ts', ...process.argv.slice(2)];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    AI_STATS_RUN_GATEWAY_TESTS: '1',
  },
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
