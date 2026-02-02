# AI Stats Parallel Test Runner 🚀

A comprehensive test runner that tests all SDKs, AI SDK implementation, and devtools in parallel.

## 🎯 Test Configuration

All SDK tests are configured to:
- ✅ **Text generation only** (no images, audio, or other modalities)
- ✅ **Use `gpt-5-nano` model** for all requests
- ✅ **Low cost** - Nano model is the cheapest option
- ✅ **Fast execution** - Optimized for quick feedback

Configuration is centralized in `packages/smoke-manifest.json`.

## Quick Start

```bash
# Run all tests in parallel
pnpm test:all

# Or directly
node test-all.mjs
```

## What It Tests

### ✅ Core Packages
- **AI SDK** (`ai-sdk-ai-stats`) - AI SDK implementation for Vercel AI SDK
- **Devtools Core** - Core devtools functionality
- **Devtools Viewer** - Devtools viewer UI

### ✅ Language SDKs
- **TypeScript/JavaScript SDK** - Smoke tests
- **Python SDK** - pytest unit tests
- **Go SDK** - Go test suite
- **Rust SDK** - Cargo test suite
- **C# SDK** - dotnet tests (if available)
- **Java SDK** - Maven tests (if available)
- **PHP SDK** - PHPUnit tests (if available)
- **Ruby SDK** - RSpec tests (if available)

## Features

### 🔥 Parallel Execution
All tests run in parallel for maximum speed. Total runtime is determined by the slowest test, not the sum of all tests.

### 📊 Beautiful Table Output
Results are displayed in a clean ASCII table showing:
- Test name
- Status (PASS/FAIL/SKIP/TIMEOUT/ERROR)
- Duration
- Failure reason (if any)

### ⏱️ Configurable Timeouts
Each test has a sensible timeout:
- Quick tests (smoke tests): 30 seconds
- Unit tests: 60 seconds
- Integration tests: 120 seconds

### 🎯 Smart Skipping
Tests are automatically skipped if:
- Package directory doesn't exist
- Required command (pytest, go, cargo, etc.) is not installed
- No test configuration found

### 📝 Detailed Error Output
For failed tests, the script shows the last 500 characters of output to help diagnose issues.

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║     AI Stats Parallel Test Runner                       ║
║     Testing All SDKs, AI SDK, and Devtools              ║
╚══════════════════════════════════════════════════════════╝

Running 12 test suites in parallel...

┌──────────────────────────┬────────┬──────────┬────────────────────────────────┐
│ Test                     │ Status │ Duration │ Reason                         │
├──────────────────────────┼────────┼──────────┼────────────────────────────────┤
│ AI SDK (ai-sdk-ai-stats) │ PASS   │ 2.45s    │                                │
│ Devtools Core            │ PASS   │ 1.82s    │                                │
│ Devtools Viewer          │ PASS   │ 1.95s    │                                │
│ SDK TypeScript           │ PASS   │ 3.21s    │                                │
│ SDK Python               │ PASS   │ 4.56s    │                                │
│ SDK Go                   │ PASS   │ 2.78s    │                                │
│ SDK Rust                 │ PASS   │ 15.42s   │                                │
│ SDK C#                   │ SKIP   │ 0ms      │ dotnet not installed           │
│ SDK Java                 │ SKIP   │ 0ms      │ mvn not installed              │
│ SDK PHP                  │ SKIP   │ 0ms      │ vendor/bin/phpunit not installed│
│ SDK Ruby                 │ SKIP   │ 0ms      │ bundle not installed           │
└──────────────────────────┴────────┴──────────┴────────────────────────────────┘

════════════════════════════════════════════════════════════
SUMMARY
════════════════════════════════════════════════════════════
✓ Passed:  7/12
✗ Failed:  0/12
○ Skipped: 5/12
⏱ Total time: 15.42s
════════════════════════════════════════════════════════════
```

## Exit Codes

- **0**: All tests passed (skipped tests don't count as failures)
- **1**: One or more tests failed, timed out, or errored

## Customization

To add a new test, edit `test-all.mjs` and add to the `testConfigs` array:

```javascript
{
    name: 'My New Test',
    path: 'packages/my-package',
    command: 'npm',
    args: ['test'],
    timeout: 60000,
    skipIfNoCommand: false, // Set to true for non-npm commands
}
```

## Prerequisites

### Always Available
- Node.js (for running the script)
- pnpm (for TypeScript/JavaScript packages)

### Optional (tests will skip if not installed)
- **Python**: `pip install pytest` (for Python SDK)
- **Go**: `go` command (for Go SDK)
- **Rust**: `cargo` command (for Rust SDK)
- **C#**: `dotnet` command (for C# SDK)
- **Java**: `mvn` command (for Java SDK)
- **PHP**: `composer install` + PHPUnit (for PHP SDK)
- **Ruby**: `bundle` command (for Ruby SDK)

## CI/CD Integration

The script is designed for CI/CD:

```yaml
# GitHub Actions example
- name: Run all tests
  run: pnpm test:all

# Will exit with code 1 if any tests fail
```

## Troubleshooting

### Test Timeout
If a test times out, increase the timeout in the config:

```javascript
timeout: 120000, // 2 minutes
```

### Command Not Found
Make sure the required command is in your PATH:

```bash
# Check if command exists
which pytest
which go
which cargo
```

### Test Skipped
If a test is unexpectedly skipped, check:
1. Package directory exists
2. Required command is installed
3. `skipIfNoCommand` is set correctly

## Performance Tips

1. **Parallel execution is automatic** - No need to configure anything
2. **Fastest on multi-core machines** - Each test runs on its own process
3. **SSD helps** - Faster disk I/O for compilation and test execution
4. **Close heavy apps** - Free up CPU and memory for tests

## License

MIT - Same as the main AI Stats project
