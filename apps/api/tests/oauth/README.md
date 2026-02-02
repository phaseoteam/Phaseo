# OAuth Testing Suite

Comprehensive tests for OAuth 2.1 implementation.

## Quick Start

### Run All Tests

```bash
# From project root
npm run test:oauth

# Or manually
cd apps/api
npm test -- oauth
```

### Run Specific Test Suites

```bash
# Unit tests only
npm test -- jwt.test.ts

# Integration tests only
npm test -- flow.test.ts

# Manual flow test
./scripts/test-oauth-flow.sh
```

## Test Suites

### 1. Unit Tests (`__tests__/jwt.test.ts`)

Tests JWT validation utilities in isolation:
- JWT format detection
- JWT decoding
- Claims validation
- Signature verification (mocked)

**Run:**
```bash
npm test -- jwt.test.ts
```

**Coverage:**
- ✓ JWT format validation
- ✓ Token decoding
- ✓ Expiration checks
- ✓ Issuer validation
- ✓ Audience validation
- ✓ Custom claims validation

### 2. Integration Tests (`flow.test.ts`)

End-to-end OAuth flow testing:
- OAuth app registration
- PKCE generation
- Authorization request
- Code exchange
- API requests
- Token refresh
- Authorization revocation

**Run:**
```bash
# Set environment variables first
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
export API_BASE_URL=http://localhost:8787

npm test -- flow.test.ts
```

**Prerequisites:**
- Supabase OAuth server enabled
- Local API server running
- Test database accessible

**Note:** Some tests will skip if Supabase OAuth is not fully configured.

### 3. Manual Flow Test (`scripts/test-oauth-flow.sh`)

Interactive shell script for end-to-end testing:

**Run:**
```bash
export API_KEY=aistats_v1_sk_YOUR_KEY
export SUPABASE_URL=https://your-project.supabase.co
./scripts/test-oauth-flow.sh
```

**What it tests:**
1. Creates OAuth app via API
2. Generates PKCE parameters
3. Builds authorization URL (manual browser step)
4. Exchanges code for tokens
5. Makes API request with token
6. Refreshes access token
7. Tests token revocation
8. Cleans up test data

**Perfect for:**
- Production verification
- Debugging OAuth issues
- Demonstrating OAuth flow
- Onboarding new developers

## Test Configuration

### Environment Variables

```bash
# Required for integration tests
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
API_BASE_URL=http://localhost:8787

# Optional
SUPABASE_ANON_KEY=your_anon_key
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=test-password
```

### Test Database

Tests create temporary data:
- Test users
- Test teams
- Test OAuth apps
- Test authorizations

**Cleanup:** Automatic in `afterAll()` hooks.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: OAuth Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test -- jwt.test.ts

      - name: Run integration tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          API_BASE_URL: http://localhost:8787
        run: |
          npm run dev:api &
          sleep 5
          npm test -- flow.test.ts
```

## Troubleshooting

### Tests Failing Locally

**Issue:** Integration tests fail with "Supabase OAuth not configured"

**Solution:**
1. Enable OAuth 2.1 in Supabase dashboard
2. Set environment variables correctly
3. Run database migrations

**Issue:** Manual script can't exchange code

**Solution:**
1. Check SUPABASE_URL is correct
2. Verify client credentials
3. Ensure code_verifier matches code_challenge

### Tests Passing Locally But Failing in CI

**Issue:** Environment differences

**Solution:**
1. Check CI environment variables
2. Verify network access to Supabase
3. Ensure test database is seeded

## Performance Benchmarks

Target performance metrics:

| Metric | Target | Measured |
|--------|--------|----------|
| JWT validation | <10ms p95 | TBD |
| JWKS fetch | <100ms p95 | TBD |
| JWKS cache hit | >95% | TBD |
| Authorization flow | <2s total | TBD |
| Token refresh | <500ms | TBD |

Run benchmarks:
```bash
npm run bench:oauth
```

## Security Tests

### Checklist

- [ ] Client secret never logged
- [ ] Tokens not exposed in errors
- [ ] PKCE validation works
- [ ] Expired tokens rejected
- [ ] Revoked tokens rejected
- [ ] Invalid signatures rejected
- [ ] Rate limiting works
- [ ] CORS configured correctly

### Penetration Testing

For security-focused testing:

```bash
# Test invalid PKCE
curl -X POST "$API_BASE_URL/oauth/token" \
  -d '{"code_verifier": "wrong"}' \
  # Should fail

# Test token reuse
# Exchange same code twice
# Second attempt should fail

# Test rate limiting
for i in {1..101}; do
  curl "$API_BASE_URL/v1/chat/completions" \
    -H "Authorization: Bearer $TOKEN"
done
# Should get 429 after 100 requests
```

## Adding New Tests

### Unit Test Template

```typescript
describe('New Feature', () => {
  it('should handle happy path', () => {
    // Arrange
    const input = ...;

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe(expected);
  });

  it('should handle error case', () => {
    expect(() => myFunction(invalid)).toThrow();
  });
});
```

### Integration Test Template

```typescript
describe('New OAuth Feature', () => {
  let testData: any;

  beforeAll(async () => {
    // Setup test data
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should complete flow', async () => {
    const response = await fetch(...);
    expect(response.ok).toBe(true);
  });
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [OAuth 2.1 Spec](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [PKCE RFC](https://tools.ietf.org/html/rfc7636)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## Support

Issues with tests?

- Check logs: `npm run test:oauth -- --reporter=verbose`
- Discord: [#engineering](https://discord.gg/aistats)
- Email: dev@aistats.ai
