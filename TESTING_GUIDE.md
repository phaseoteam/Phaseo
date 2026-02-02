# OAuth Testing Guide

Complete guide to testing the OAuth 2.1 implementation before production deployment.

## Quick Test (5 minutes)

Run the automated manual test script:

```bash
export API_KEY=aistats_v1_sk_YOUR_KEY
export SUPABASE_URL=https://your-project.supabase.co
./scripts/test-oauth-flow.sh
```

This will:
- ✓ Create OAuth app
- ✓ Generate PKCE
- ✓ Test authorization flow (with manual browser step)
- ✓ Exchange code for tokens
- ✓ Make API request
- ✓ Refresh token
- ✓ Test revocation
- ✓ Cleanup

## Full Test Suite (30 minutes)

### 1. Unit Tests (5 min)

Test JWT validation logic:

```bash
cd apps/api
npm test -- --config=vitest.oauth.config.ts jwt.test.ts
```

**Expected:** All tests pass, >80% coverage

### 2. Integration Tests (10 min)

Test complete OAuth flows:

```bash
cd apps/api

# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_key
export API_BASE_URL=http://localhost:8787

# Start API server in background
npm run dev &
API_PID=$!

# Run tests
npm test -- --config=vitest.oauth.config.ts flow.test.ts

# Cleanup
kill $API_PID
```

**Expected:** Most tests pass (some may skip if Supabase OAuth not configured)

### 3. Security Tests (5 min)

```bash
cd apps/api
npm test -- --config=vitest.oauth.config.ts security.test.ts
```

**Expected:** All security checks pass

### 4. Performance Tests (5 min)

```bash
cd apps/api
npm test -- --config=vitest.oauth.config.ts performance.test.ts
```

**Expected:**
- JWT validation: <10ms p95
- JWKS cache hit: >95%
- Authorization page: <500ms

### 5. E2E Tests (5 min)

Test UI flows with Playwright:

```bash
cd apps/web

# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
npm run test:e2e
```

**Expected:** UI flows work correctly

## Test Matrix

### Scenarios to Test

| Scenario | Manual | Unit | Integration | E2E | Security | Performance |
|----------|--------|------|-------------|-----|----------|-------------|
| Create OAuth app | ✓ | - | ✓ | ✓ | - | - |
| Invalid app name | - | - | ✓ | ✓ | - | - |
| Authorization request | ✓ | - | ✓ | ✓ | - | - |
| Missing PKCE | - | - | ✓ | ✓ | ✓ | - |
| Wrong PKCE verifier | - | - | ✓ | - | ✓ | - |
| User approves | ✓ | - | ✓ | ✓ | - | - |
| User denies | ✓ | - | ✓ | ✓ | - | - |
| Token exchange | ✓ | - | ✓ | - | - | ✓ |
| JWT validation | ✓ | ✓ | ✓ | - | ✓ | ✓ |
| Expired token | - | ✓ | ✓ | - | ✓ | - |
| Invalid signature | - | ✓ | ✓ | - | ✓ | - |
| Token refresh | ✓ | - | ✓ | - | - | ✓ |
| Authorization revocation | ✓ | - | ✓ | ✓ | ✓ | - |
| Revoked token rejected | ✓ | - | ✓ | - | ✓ | - |

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/test.yml`:

```yaml
name: OAuth Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: |
          cd apps/api
          npm test -- --config=vitest.oauth.config.ts jwt.test.ts

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./apps/api/coverage/coverage-final.json

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm ci

      - name: Start API server
        run: |
          cd apps/api
          npm run dev &
          sleep 5

      - name: Run integration tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          API_BASE_URL: http://localhost:8787
        run: |
          cd apps/api
          npm test -- --config=vitest.oauth.config.ts flow.test.ts

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: |
          cd apps/web
          npm run test:e2e

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

## Pre-Production Checklist

Run all tests before deploying to production:

### Automated Tests
- [ ] Unit tests pass
- [ ] Integration tests pass (or skipped with reason)
- [ ] Security tests pass
- [ ] Performance benchmarks meet targets
- [ ] E2E tests pass

### Manual Tests
- [ ] Create OAuth app via UI
- [ ] Create OAuth app via API
- [ ] Complete authorization flow
- [ ] Make API request with token
- [ ] Refresh access token
- [ ] Revoke authorization
- [ ] Verify revoked token rejected
- [ ] Delete OAuth app

### Security Checks
- [ ] Client secret shown only once
- [ ] PKCE validation works
- [ ] Expired tokens rejected
- [ ] Invalid signatures rejected
- [ ] Revocation immediate
- [ ] Rate limiting active
- [ ] CORS configured
- [ ] HTTPS enforced (production)

### Performance Checks
- [ ] JWT validation <10ms p95
- [ ] JWKS cache hit >95%
- [ ] Authorization page <500ms
- [ ] Token refresh <1s
- [ ] No memory leaks

## Debugging Failed Tests

### Unit Test Failures

**Issue:** JWT validation tests fail

```bash
# Check JWT format
node -e "console.log('eyJhbGc...'.split('.'))"

# Verify base64url encoding
node -e "console.log(Buffer.from('test').toString('base64url'))"
```

**Issue:** Claims validation fails

```bash
# Check current timestamp
node -e "console.log(Math.floor(Date.now() / 1000))"

# Verify expiration logic
node -e "
const now = Math.floor(Date.now() / 1000);
const exp = now + 3600;
console.log('Now:', now);
console.log('Expires:', exp);
console.log('Valid:', exp > now);
"
```

### Integration Test Failures

**Issue:** "Supabase OAuth not configured"

**Solution:**
1. Enable OAuth 2.1 in Supabase dashboard
2. Set SUPABASE_URL environment variable
3. Verify service role key has correct permissions

**Issue:** Token exchange fails

**Solution:**
1. Check authorization code is valid
2. Verify code_verifier matches code_challenge
3. Ensure redirect_uri matches exactly
4. Check client credentials

### E2E Test Failures

**Issue:** Cannot find elements

**Solution:**
1. Check selectors match actual DOM
2. Increase timeout for slow pages
3. Add explicit waits for dynamic content
4. Check for authentication redirects

**Issue:** Tests timeout

**Solution:**
1. Increase test timeout in config
2. Check network connectivity
3. Verify dev server is running
4. Check for infinite loops/redirects

## Continuous Monitoring

### Post-Deployment Monitoring

Run synthetic tests every hour:

```bash
# Add to cron
0 * * * * /path/to/scripts/test-oauth-flow.sh >> /var/log/oauth-monitor.log 2>&1
```

### Metrics to Track

Create dashboards for:

- **OAuth Events**
  - Authorizations per hour
  - Authorization success rate
  - Token exchanges per hour
  - Token refresh rate
  - Revocations per hour

- **Performance**
  - JWT validation latency (p50, p95, p99)
  - JWKS cache hit rate
  - Authorization page load time
  - Token exchange latency

- **Errors**
  - Invalid token rate
  - Expired token rate
  - Revoked token attempts
  - Failed authorization rate
  - PKCE validation failures

### Alerts

Set up alerts for:

- OAuth token validation failures >5% in 5 min
- Authorization success rate <80% in 15 min
- JWKS cache hit rate <90% in 5 min
- JWT validation latency >20ms p95
- Unusual revocation spike (>10 in 5 min)

## Troubleshooting

### Common Issues

#### Tokens not working

```bash
# Decode token
echo "TOKEN" | cut -d'.' -f2 | base64 -d | jq '.'

# Check claims
# - exp: should be in future
# - iss: should match Supabase URL
# - user_id, team_id, client_id: should exist
```

#### Authorization revoked immediately

```bash
# Check database
supabase db query "
SELECT * FROM oauth_authorizations
WHERE client_id = 'YOUR_CLIENT_ID'
"

# Check revoked_at is NULL
```

#### JWKS fetch failing

```bash
# Test JWKS endpoint
curl https://YOUR_PROJECT.supabase.co/.well-known/jwks.json

# Should return JSON with keys array
```

## Support

- **Discord:** #engineering channel
- **Email:** dev@aistats.ai
- **Docs:** /v1/guides/oauth-quickstart
