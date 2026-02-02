# OAuth 2.1 Testing Walkthrough

Complete step-by-step guide to test your OAuth implementation.

---

## Prerequisites ✅

Before testing, ensure:

1. **Supabase OAuth 2.1 Server Enabled**
   - Dashboard → Authentication → OAuth Server → ✅ Enabled
   - ✅ Dynamic Client Registration Enabled

2. **Database Migration Applied**
   ```bash
   cd apps/web
   supabase db push
   ```
   Expected: "All migrations applied" (including `20260127000001_oauth_tables.sql`)

3. **Environment Variables Set**
   ```bash
   # Web app (.env.local)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # API (wrangler.toml or Cloudflare dashboard)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Applications Running**
   ```bash
   # Terminal 1: Web app
   cd apps/web
   npm run dev
   # Should start on http://localhost:3100

   # Terminal 2: API gateway
   cd apps/api
   npm run dev
   # Should start on http://localhost:8787
   ```

---

## Test 1: Create an OAuth App (5 minutes)

### Step 1.1: Navigate to OAuth Apps
1. Open browser: `http://localhost:3100`
2. Sign in to your account
3. Navigate to: **Settings → OAuth Apps** (in sidebar)

**Expected:**
- ✅ See "OAuth Apps" page with **ALPHA** badge
- ✅ See yellow warning banner explaining alpha status
- ✅ See "Create OAuth App" button

### Step 1.2: Create Your First OAuth App
1. Click **"Create OAuth App"** button
2. Fill in the form:
   ```
   Name: Test OAuth App
   Description: Testing OAuth integration
   Homepage URL: https://example.com
   Redirect URIs: http://localhost:3000/callback
   ```
3. Click **"Create App"**

**Expected:**
- ✅ Dialog shows success message
- ✅ See **Client ID** and **Client Secret** (only shown once!)
- ✅ Yellow warning: "Save your client secret now"
- 📋 **COPY BOTH VALUES** - you'll need them!

**What Just Happened:**
```
1. Server action called createOAuthAppAction()
2. Supabase Admin SDK created OAuth client
3. Metadata stored in oauth_app_metadata table
4. Client ID and secret returned (secret is hashed in Supabase)
```

### Step 1.3: Verify App Creation
1. Close the dialog
2. Refresh the page

**Expected:**
- ✅ See your "Test OAuth App" in the list
- ✅ Shows: 0 active authorizations, Created date
- ✅ Click on the app to see details

### Step 1.4: Verify in Database (Optional)
```sql
-- Run in Supabase SQL Editor
SELECT * FROM oauth_app_metadata WHERE name = 'Test OAuth App';
SELECT * FROM oauth_apps_with_stats WHERE name = 'Test OAuth App';
```

**Expected:**
- ✅ See your app with client_id, team_id, status='active'
- ✅ Stats show 0 authorizations, 0 requests

---

## Test 2: Test Dynamic Client Registration (5 minutes)

### Step 2.1: Run the Test Script
```bash
cd apps/web

# Set environment variables
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
node ../test-oauth-admin-api.mjs
```

**Expected Output:**
```
🔍 Testing OAuth Admin API access...

1️⃣ Testing listClients()...
   ✅ Success! Found 1 OAuth clients

2️⃣ Testing createClient()...
   ✅ Success! Created client: oauth_1737123456_abc
   Client Name: Test OAuth App 1737123456789
   Client Secret: secret_1737123456...

3️⃣ Testing deleteClient() (cleanup)...
   ✅ Success! Deleted test client

✅ All tests passed! OAuth Admin API is fully functional.
```

**If Test Fails:**
- ❌ "Dynamic client registration is not enabled" → Go enable it in Supabase Dashboard
- ❌ "Invalid JWT" → Check your service role key
- ❌ "Module not found" → Run `npm install` first

---

## Test 3: Authorization Flow (10 minutes)

This simulates a user authorizing your OAuth app.

### Step 3.1: Build Authorization URL

Using the Client ID from Test 1, create an authorization URL:

```bash
# Generate PKCE challenge (copy this code to a file: generate-pkce.js)
node -e "
const crypto = require('crypto');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
console.log('Verifier:', verifier);
console.log('Challenge:', challenge);
console.log('\\nAuthorization URL:');
console.log(\`http://localhost:3100/oauth/consent?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=openid%20email%20gateway:access&code_challenge=\${challenge}&code_challenge_method=S256&state=test123\`);
"
```

**Expected Output:**
```
Verifier: abc123...xyz
Challenge: def456...uvw

Authorization URL:
http://localhost:3100/oauth/consent?client_id=oauth_...&redirect_uri=...
```

📋 **SAVE THE VERIFIER** - you'll need it later!

### Step 3.2: Open Authorization URL
1. Copy the Authorization URL
2. Replace `YOUR_CLIENT_ID` with your actual client ID from Test 1
3. Paste into browser

**Expected:**
- ✅ Redirected to sign-in page (if not logged in)
- ✅ After sign-in, see OAuth consent page
- ✅ See "OAuth Alpha" badge
- ✅ See your app name: "Test OAuth App"
- ✅ See app description and homepage URL
- ✅ See requested permissions:
  - Identity (openid)
  - Email Address (email)
  - API Gateway Access (gateway:access)
- ✅ See team selector dropdown
- ✅ See "Approve" and "Deny" buttons

**What's Happening:**
```
1. Supabase validates client_id exists
2. Verifies PKCE challenge is present
3. Fetches app metadata from oauth_app_metadata
4. Shows consent form to user
```

### Step 3.3: Approve Authorization
1. Select your team from dropdown
2. Review the permissions
3. Click **"Approve"**

**Expected:**
- ✅ Redirected to: `http://localhost:3000/callback?code=auth_1234567890_abc&state=test123`
- ✅ See error page (expected - we don't have a real callback server)
- 📋 **COPY THE CODE** from the URL (the part after `code=` and before `&state`)

**What Just Happened:**
```
1. User approved authorization
2. Record created in oauth_authorizations table
3. Authorization code generated (single-use, expires in 10 min)
4. User redirected back to your app with the code
```

### Step 3.4: Verify Authorization in Database
```sql
-- Run in Supabase SQL Editor
SELECT * FROM oauth_authorizations
WHERE client_id = 'YOUR_CLIENT_ID'
ORDER BY created_at DESC;

SELECT * FROM user_authorized_apps;
```

**Expected:**
- ✅ See authorization record with revoked_at=NULL (active)
- ✅ See your app listed with team name

### Step 3.5: Verify in Dashboard
1. Go to: **Settings → Authorized Apps**
2. Look for "Test OAuth App"

**Expected:**
- ✅ See "Test OAuth App" listed
- ✅ Shows: authorized date, team name, scopes
- ✅ See "Revoke Access" button

---

## Test 4: Token Exchange (5 minutes)

Now exchange the authorization code for access tokens.

### Step 4.1: Exchange Code for Tokens

**IMPORTANT:** This step currently uses **mock tokens** because the consent flow needs to be integrated with Supabase's OAuth token endpoint. For alpha testing, we can verify the UI flow works.

In a real implementation, you would:

```bash
curl -X POST http://localhost:8787/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code_verifier": "YOUR_VERIFIER",
    "redirect_uri": "http://localhost:3000/callback"
  }'
```

**Expected Response (when fully integrated):**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_token_here",
  "scope": "openid email gateway:access"
}
```

**Current Alpha Limitation:**
- The consent flow generates a mock code
- To test token validation, you need a real JWT from Supabase
- This will be fixed in the next iteration (use `authorization_id` flow)

---

## Test 5: Using the Access Token (5 minutes)

Once you have a real access token (JWT), test it with the API gateway.

### Step 5.1: Make API Request

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

**Expected:**
- ✅ Request succeeds (or fails with provider error, not auth error)
- ✅ Gateway validates JWT signature using JWKS
- ✅ Extracts user_id, team_id, client_id from JWT claims
- ✅ Checks oauth_authorizations for revocation
- ✅ Processes request using team's credits/limits

**What's Being Validated:**
```
1. JWT signature verification (Web Crypto API)
2. JWT claims validation (exp, iss, aud)
3. Custom claims extraction (user_id, team_id, client_id)
4. Revocation check (oauth_authorizations.revoked_at IS NULL)
5. RLS enforcement (team-based access)
```

### Step 5.2: Verify Request Logged

```sql
-- Run in Supabase SQL Editor
SELECT
  id,
  auth_method,
  oauth_client_id,
  oauth_user_id,
  created_at
FROM gateway_requests
WHERE auth_method = 'oauth'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- ✅ See request with auth_method='oauth'
- ✅ See oauth_client_id = your client ID
- ✅ See oauth_user_id = your user ID

---

## Test 6: Token Refresh (3 minutes)

Test refreshing an access token using the refresh token.

```bash
curl -X POST http://localhost:8787/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

**Expected:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "new_refresh_token_here"
}
```

---

## Test 7: Authorization Revocation (3 minutes)

### Step 7.1: Revoke Access
1. Go to: **Settings → Authorized Apps**
2. Find "Test OAuth App"
3. Click **"Revoke Access"**
4. Confirm in dialog

**Expected:**
- ✅ Toast notification: "Access revoked for 'Test OAuth App'"
- ✅ App disappears from list
- ✅ See success message

### Step 7.2: Verify Revocation in Database

```sql
SELECT
  id,
  client_id,
  revoked_at,
  created_at
FROM oauth_authorizations
WHERE client_id = 'YOUR_CLIENT_ID';
```

**Expected:**
- ✅ See revoked_at timestamp (not NULL)
- ✅ Authorization still exists (soft delete)

### Step 7.3: Test Token Fails After Revocation

```bash
# Use the same access token from Test 5
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Test"}]
  }'
```

**Expected:**
```json
{
  "error": "Authorization has been revoked",
  "status": 401
}
```

**What Happened:**
```
1. JWT signature still valid
2. JWT claims still valid (not expired)
3. BUT oauth_authorizations.revoked_at IS NOT NULL
4. Gateway rejects the request
```

---

## Test 8: OAuth App Management (5 minutes)

### Step 8.1: Regenerate Client Secret
1. Go to: **Settings → OAuth Apps → Test OAuth App**
2. Click **"Regenerate"** (next to Client Secret)
3. Confirm in dialog

**Expected:**
- ✅ See new client secret (only shown once!)
- ✅ Yellow warning to save it
- ✅ Copy button works
- ✅ Old secret no longer works

### Step 8.2: Update App Details
1. On app detail page
2. Change description to: "Updated description"
3. Click **"Save"** (if implemented)

**Expected:**
- ✅ Changes saved
- ✅ Toast notification
- ✅ Page refreshes with new values

### Step 8.3: Delete OAuth App
1. On app detail page
2. Click **"Delete App"** button
3. Type app name to confirm: `Test OAuth App`
4. Click **"Delete App"**

**Expected:**
- ✅ Redirected to OAuth Apps list
- ✅ App no longer appears
- ✅ Toast notification

### Step 8.4: Verify Cleanup

```sql
-- Check app deleted
SELECT * FROM oauth_app_metadata
WHERE name = 'Test OAuth App';

-- Check authorizations deleted (cascade)
SELECT * FROM oauth_authorizations
WHERE client_id = 'YOUR_CLIENT_ID';
```

**Expected:**
- ✅ oauth_app_metadata: 0 rows (deleted)
- ✅ oauth_authorizations: 0 rows (cascade deleted)

---

## Test 9: Security Validations (5 minutes)

### Test 9.1: PKCE Required
Try authorization URL WITHOUT code_challenge:
```
http://localhost:3100/oauth/consent?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=openid
```

**Expected:**
- ✅ Error page: "PKCE is required"

### Test 9.2: Invalid Client ID
Try authorization URL with fake client_id:
```
http://localhost:3100/oauth/consent?client_id=fake_client&redirect_uri=http://localhost:3000/callback&scope=openid&code_challenge=test&code_challenge_method=S256
```

**Expected:**
- ✅ Error page: "OAuth application not found"

### Test 9.3: Team Access Control
1. Create OAuth app in Team A
2. Sign in as user only in Team B
3. Try to view Team A's OAuth app

**Expected:**
- ✅ RLS blocks access
- ✅ See 404 or empty list

---

## Test 10: Performance Check (5 minutes)

### Test 10.1: JWT Validation Speed

```bash
# Run 100 requests with the same token
time for i in {1..100}; do
  curl -X POST http://localhost:8787/v1/chat/completions \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4","messages":[{"role":"user","content":"Test"}]}' \
    -s -o /dev/null
done
```

**Expected:**
- ✅ Average latency: <10ms per request (p95)
- ✅ JWKS cache hit rate: >95% (after first request)

### Test 10.2: JWKS Caching

Check Cloudflare KV (or cache layer):
```sql
-- If using database cache
SELECT * FROM cache WHERE key LIKE '%jwks%';
```

**Expected:**
- ✅ JWKS cached for 1 hour
- ✅ First request fetches JWKS (slower)
- ✅ Subsequent requests use cache (faster)

---

## Common Issues & Solutions

### Issue: "Module not found: @/hooks/use-toast"
**Solution:** Fixed! We replaced with Sonner. If you still see this, clear `.next` cache:
```bash
cd apps/web
rm -rf .next
npm run dev
```

### Issue: "OAuth app not found"
**Solution:**
1. Check Supabase Dashboard → OAuth Server → ✅ Enabled
2. Check database: `SELECT * FROM oauth_app_metadata;`
3. Verify service role key is correct

### Issue: "Dynamic client registration is not enabled"
**Solution:** Supabase Dashboard → Authentication → OAuth Server → Enable "Dynamic Client Registration"

### Issue: Token validation fails
**Solution:**
1. Check JWKS endpoint accessible: `curl https://YOUR_PROJECT.supabase.co/.well-known/jwks.json`
2. Verify JWT algorithm is RS256 (not HS256)
3. Check authorization not revoked: `SELECT * FROM oauth_authorizations WHERE revoked_at IS NULL;`

### Issue: RLS blocks access
**Solution:**
1. Verify user is team member: `SELECT * FROM team_members WHERE user_id = 'YOUR_ID';`
2. Check RLS policies enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'oauth_app_metadata';`
3. Verify `is_team_member()` function exists

---

## Success Criteria ✅

Your OAuth implementation is working if:

- ✅ Can create OAuth apps via dashboard
- ✅ Can create OAuth apps via Admin SDK (test script passes)
- ✅ Authorization consent page displays correctly
- ✅ User can approve/deny authorization
- ✅ Authorizations tracked in database
- ✅ Can revoke authorization via dashboard
- ✅ JWT validation works in API gateway
- ✅ Revoked tokens rejected immediately
- ✅ Can delete OAuth app (cascades to authorizations)
- ✅ RLS policies enforce team-based access
- ✅ Alpha badges visible on all OAuth pages

---

## Next Steps

After successful testing:

1. **Monitor Logs**
   - Check for OAuth-related errors
   - Verify audit logs capture OAuth metadata

2. **Invite Beta Testers**
   - Share with trusted developers
   - Gather feedback on UX

3. **Plan Beta Launch**
   - Address any issues found
   - Implement remaining features (full consent flow integration)
   - Add rate limiting
   - Enhance analytics

4. **Documentation**
   - Add your findings to docs
   - Create troubleshooting guide
   - Update roadmap

---

**Need Help?**
- Check logs: `npm run dev` output shows errors
- Check database: Run SQL queries in Supabase Dashboard
- Check network: Browser DevTools → Network tab
- Ask for help: Share error messages and screenshots
