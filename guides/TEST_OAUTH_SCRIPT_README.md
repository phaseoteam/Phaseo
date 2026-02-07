# OAuth 2.1 Flow Test Script

Automated testing script for validating the complete OAuth 2.1 authorization flow implementation.

## What This Script Tests

1. ✅ **OAuth App Creation** - Creates test app via Supabase Admin SDK
2. ✅ **PKCE Generation** - Generates secure code challenge/verifier pair
3. ✅ **Authorization URL** - Builds proper OAuth authorization URL
4. ✅ **User Consent** - Guides you through manual consent approval
5. ✅ **Token Exchange** - Exchanges authorization code for access/refresh tokens
6. ✅ **JWT Validation** - Decodes and inspects token claims
7. ✅ **API Integration** - Tests API request with OAuth bearer token
8. ✅ **Token Refresh** - Validates refresh token flow
9. ✅ **Authorization Tracking** - Verifies database records
10. ✅ **Cleanup** - Removes all test data

## Prerequisites

1. **Environment Variables**

   Create a `.env` file or export these variables:

   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   export GATEWAY_URL="https://gateway.aistats.ai"  # Optional, defaults to this
   ```

2. **Supabase Configuration**

   - OAuth 2.1 server must be enabled (Authentication → OAuth Server)
   - Dynamic client registration must be enabled
   - JWT algorithm should be RS256 or ES256 (not HS256)

3. **Dependencies**

   ```bash
   npm install @supabase/supabase-js
   ```

## Usage

### Run the Test Script

```bash
node test-oauth-flow.mjs
```

### What Happens

1. **Automated Steps** (1-2 minutes)
   - Script creates a test OAuth app
   - Generates PKCE challenge
   - Builds authorization URL
   - Displays the URL for manual consent

2. **Manual Step** (30 seconds)
   - Open the displayed URL in your browser
   - Sign in to your AI Stats account
   - Review the consent screen
   - Click "Approve"
   - Copy the `code` parameter from the redirect URL
   - Paste it back into the terminal

3. **Automated Completion** (10 seconds)
   - Script exchanges code for tokens
   - Tests API request with access token
   - Validates token refresh
   - Checks database records
   - Cleans up all test data

### Expected Output

```
======================================================================
OAuth 2.1 Flow Test Script
======================================================================

[1/9] Creating OAuth App via Admin SDK
  ✅ Created OAuth app: Test OAuth App 1738012345678
  ℹ️  Client ID: abc123...
  ℹ️  Client Secret: xyz789...

[2/9] Generating PKCE Challenge
  ✅ Generated PKCE challenge
  ℹ️  Code Verifier: qwerty...
  ℹ️  Code Challenge: abcd1234...
  ℹ️  Method: S256

[3/9] Creating Authorization URL
  ✅ Generated authorization URL

──────────────────────────────────────────────────────────────────────
MANUAL STEP REQUIRED:
──────────────────────────────────────────────────────────────────────

1. Open this URL in your browser:

   https://your-project.supabase.co/auth/v1/oauth/authorize?...

2. Sign in if needed
3. Review and approve the OAuth consent
4. You will be redirected to:
   https://localhost:3000/auth/callback?code=...&state=...

5. Copy the "code" parameter from the redirect URL
   (The page won't load since this is a test URI)

──────────────────────────────────────────────────────────────────────

Paste the authorization code here: _
```

## Troubleshooting

### "Failed to create OAuth client"

**Problem**: Dynamic client registration is not enabled

**Solution**:
1. Go to Supabase Dashboard → Authentication → OAuth Server
2. Enable "Dynamic Client Registration"
3. Retry the script

### "Token exchange failed"

**Problem**: Invalid authorization code or PKCE mismatch

**Possible causes**:
- Code expired (valid for 10 minutes)
- Code already used (single-use only)
- Wrong code verifier
- Client credentials mismatch

**Solution**: Run the script again and complete the manual step faster

### "API request returned 401"

**Problem**: JWT validation not yet implemented in API gateway

**Status**: Expected if Task 5 is incomplete

**Next steps**:
1. Complete `apps/api/src/pipeline/before/oauth.ts`
2. Integrate with `apps/api/src/pipeline/before/auth.ts`
3. Deploy API gateway changes

### "No authorizations found in database"

**Problem**: Authorization tracking not recording approvals

**Status**: Expected if `oauth_authorizations` insert is not implemented in consent flow

**Next steps**:
1. Update `apps/web/src/app/(auth)/oauth/consent/actions.ts`
2. Add INSERT to `oauth_authorizations` table on approval

## What This Validates

### ✅ Security

- PKCE challenge/verifier properly generated
- Authorization code single-use enforcement
- Client authentication required for token exchange
- JWT signature valid (RS256/ES256)
- Token expiration claims present

### ✅ Functionality

- OAuth app CRUD operations work
- Authorization URL generation correct
- Token exchange returns access + refresh tokens
- Refresh token flow works
- Cleanup removes all test data

### ✅ Integration

- Supabase Admin SDK working
- OAuth 2.1 server responding
- Database schema correct
- API gateway accepts bearer tokens (if implemented)

## Using in CI/CD

You can automate this script in CI/CD by pre-generating an authorization code:

```bash
# In CI environment
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export TEST_AUTH_CODE="pre-generated-code"  # Get from setup

node test-oauth-flow.mjs --automated
```

**Note**: Full automation requires headless browser (Playwright) for consent flow.

## Next Steps After Successful Test

1. ✅ OAuth implementation is functional
2. ⚠️  Review security checklist in `OAUTH_ALPHA_NOTICE.md`
3. ⚠️  Test in production-like environment
4. ⚠️  Set up monitoring for OAuth endpoints
5. ⚠️  Document OAuth integration for developers
6. ✅ Deploy to production

## Related Files

- `test-oauth-admin-api.mjs` - Tests Admin SDK access only
- `OAUTH_TESTING_WALKTHROUGH.md` - Manual testing guide
- `OAUTH_ALPHA_NOTICE.md` - Alpha status and limitations
- `OAUTH_PRODUCTION_READY.md` - Production deployment checklist

## Support

If you encounter issues:

1. Check Supabase Dashboard logs (Authentication → Logs)
2. Review `oauth_authorizations` table for records
3. Inspect JWT token claims at [jwt.io](https://jwt.io)
4. Enable debug logging in Supabase settings
5. Check API gateway logs for validation errors

---

**Status**: Alpha - Use for testing only
**Last Updated**: 2026-01-28
