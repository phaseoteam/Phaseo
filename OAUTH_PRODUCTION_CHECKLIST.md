# OAuth 2.1 Production Deployment Checklist

**Target:** Production deployment ready in 1 day
**Date:** January 28, 2026

---

## ⚡ Quick Start (30 minutes)

### 1. Enable Supabase OAuth Server (5 min)

1. Open Supabase Dashboard → Authentication → OAuth Server
2. Click "Enable OAuth 2.1 Server"
3. Configure settings:
   - **Authorization endpoint path:** `/oauth/consent`
   - **JWT algorithm:** RS256 or ES256 (for JWKS)
   - **Access token lifetime:** 3600 seconds (1 hour)
   - **Refresh token lifetime:** 2592000 seconds (30 days)
4. Save configuration

### 2. Deploy Database Migration (2 min)

```bash
cd apps/web
supabase db push

# Verify tables created
supabase db diff
```

**Expected tables:**
- `oauth_app_metadata`
- `oauth_authorizations`
- `gateway_requests` (with new OAuth columns)

### 3. Replace Mock OAuth Code (15 min)

#### File: `apps/web/src/app/(dashboard)/settings/oauth-apps/actions.ts`

**Replace line 66-68:**
```typescript
// BEFORE (mock):
const mockClientId = `oauth_${Date.now()}_${Math.random().toString(36).substring(7)}`;
const mockClientSecret = `secret_${Date.now()}_${Math.random().toString(36).substring(7)}`;

// AFTER (real):
const supabaseAdmin = createClient();
const { data: oauthClient, error: clientError } = await supabaseAdmin.auth.admin.createOAuthClient({
  name: input.name,
  redirect_uris: input.redirect_uris,
});

if (clientError || !oauthClient) {
  return { error: `Failed to create OAuth client: ${clientError?.message}` };
}

const { client_id, client_secret } = oauthClient;
```

**Same pattern for:**
- `regenerateClientSecretAction` (line 213)
- `deleteOAuthAppAction` (line 294)
- `apps/api/src/routes/v1/control/oauth-clients.ts` (lines 68-70)

### 4. Environment Variables (3 min)

Add to `.env`:
```bash
# Supabase OAuth
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Custom OAuth settings
OAUTH_TOKEN_EXPIRY=3600
OAUTH_REFRESH_EXPIRY=2592000
```

### 5. Deploy to Production (5 min)

```bash
# Deploy web app
cd apps/web
npm run build
npm run deploy

# Deploy API gateway
cd apps/api
npm run deploy

# Verify deployment
curl https://gateway.aistats.ai/v1/control/health
```

---

## 🔐 Security Hardening (1 hour)

### 1. Client Secret Storage

✅ **Verify:** Client secrets never logged or exposed
✅ **Check:** Secrets stored hashed in database (if storing)
✅ **Test:** Secret only returned once on creation

### 2. Redirect URI Validation

Add to `apps/web/src/app/(auth)/oauth/consent/page.tsx` (line 87):

```typescript
// Fetch registered redirect URIs from OAuth client
const { data: oauthClient } = await supabase.auth.admin.getOAuthClient(params.client_id);

if (!oauthClient?.redirect_uris?.includes(params.redirect_uri)) {
  return (
    <Alert variant="destructive">
      <AlertDescription>Invalid redirect_uri</AlertDescription>
    </Alert>
  );
}
```

### 3. Rate Limiting

Add to `apps/api/src/pipeline/before/oauth.ts`:

```typescript
// Add before line 102
const rateLimitKey = `oauth:rate:${token}`;
const attempts = await c.env.KV?.get(rateLimitKey);

if (attempts && parseInt(attempts) > 100) {
  return { authenticated: false, error: "rate_limit_exceeded" };
}

// Increment counter
await c.env.KV?.put(rateLimitKey, String((parseInt(attempts || '0') + 1)), {
  expirationTtl: 60,
});
```

### 4. CORS Configuration

Update `apps/api/src/index.ts`:

```typescript
app.use('*', cors({
  origin: (origin) => {
    // Allow OAuth callback redirects
    const allowedOrigins = [
      'https://gateway.aistats.ai',
      'https://yourapp.com',
      // Add your registered OAuth app domains
    ];
    return allowedOrigins.includes(origin) ? origin : null;
  },
  credentials: true,
}));
```

---

## 📊 Monitoring Setup (30 minutes)

### 1. Add Axiom Logging

In `apps/api/src/pipeline/audit/axiom.ts`, add OAuth event tracking:

```typescript
export async function logOAuthEvent(event: {
  type: 'authorization' | 'token_exchange' | 'token_refresh' | 'revocation';
  client_id: string;
  user_id?: string;
  team_id?: string;
  success: boolean;
  error?: string;
}) {
  await axiom.ingest('oauth-events', [{
    ...event,
    timestamp: new Date().toISOString(),
  }]);
}
```

### 2. Dashboard Alerts

Create alerts in Axiom/Datadog:

- **High Error Rate:** OAuth token validation failures > 5% in 5 minutes
- **Suspicious Activity:** Same client_id with >100 requests/minute
- **Authorization Spikes:** >50 new authorizations in 1 minute
- **Revocation Rate:** >10% of active authorizations revoked in 1 hour

### 3. Metrics to Track

```typescript
// Add to apps/api/src/pipeline/before/oauth.ts
const metrics = {
  'oauth.validation.duration': Date.now() - startTime,
  'oauth.validation.success': validation.valid ? 1 : 0,
  'oauth.jwks.cache.hit': jwksFromCache ? 1 : 0,
  'oauth.revocation.check': isRevoked ? 1 : 0,
};

// Send to your metrics service
```

---

## ✅ Pre-Flight Testing (45 minutes)

### Test 1: Create OAuth App
```bash
# Via UI
1. Go to https://gateway.aistats.ai/settings/oauth-apps
2. Click "Create OAuth App"
3. Fill in name, redirect_uri
4. Verify client_id and client_secret returned
5. Verify secret is hidden after closing dialog

# Via API
curl -X POST https://gateway.aistats.ai/v1/control/oauth-clients \
  -H "Authorization: Bearer aistats_v1_sk_YOUR_API_KEY" \
  -d '{
    "name": "Test App",
    "redirect_uris": ["http://localhost:3000/callback"]
  }'
```

### Test 2: Authorization Flow
```bash
# 1. Generate PKCE
node -e "
const crypto = require('crypto');
const v = crypto.randomBytes(32).toString('base64url');
const c = crypto.createHash('sha256').update(v).digest('base64url');
console.log('Verifier:', v);
console.log('Challenge:', c);
"

# 2. Open authorization URL
open "https://gateway.aistats.ai/oauth/consent?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=openid%20email%20gateway:access&state=random123&code_challenge=CHALLENGE&code_challenge_method=S256"

# 3. After approval, exchange code
curl -X POST https://YOUR_PROJECT.supabase.co/auth/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "auth_code_from_redirect",
    "code_verifier": "VERIFIER_FROM_STEP_1",
    "redirect_uri": "http://localhost:3000/callback",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

### Test 3: API Request with Token
```bash
curl -X POST https://gateway.aistats.ai/v1/chat/completions \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_STEP_2" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Test OAuth"}]
  }'
```

### Test 4: Token Refresh
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/auth/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "REFRESH_TOKEN_FROM_STEP_2",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

### Test 5: Revocation
```bash
# Via UI
1. Go to https://gateway.aistats.ai/settings/authorized-apps
2. Find your test app
3. Click "Revoke Access"
4. Try API request with old token → should fail with 401/403

# Verify revocation
curl -X POST https://gateway.aistats.ai/v1/chat/completions \
  -H "Authorization: Bearer REVOKED_TOKEN" \
  # Expected: 401 Unauthorized
```

---

## 🚀 Go-Live Checklist

### Pre-Deployment
- [ ] Database migration applied successfully
- [ ] Mock OAuth code replaced with real Supabase calls
- [ ] Environment variables configured
- [ ] HTTPS enabled (production only)
- [ ] Redirect URI validation implemented
- [ ] Rate limiting configured
- [ ] Monitoring and alerts set up

### Deployment
- [ ] Web app deployed
- [ ] API gateway deployed
- [ ] Health check passes: `curl https://gateway.aistats.ai/v1/control/health`
- [ ] Database connection verified

### Post-Deployment
- [ ] Create test OAuth app (manual)
- [ ] Complete authorization flow (manual)
- [ ] Make test API request (manual)
- [ ] Verify token refresh works
- [ ] Verify revocation works
- [ ] Check monitoring dashboards
- [ ] Review logs for errors

### Documentation
- [ ] Update changelog with OAuth feature
- [ ] Publish OAuth quickstart guide
- [ ] Announce on Discord/Twitter
- [ ] Email existing API users about OAuth support

---

## 🔥 Rollback Plan

If OAuth causes issues:

### Quick Disable (keeps API keys working)
```typescript
// apps/api/src/pipeline/before/auth.ts
// Comment out line 185-187:
/*
if (isJWTFormat(token)) {
  return await authenticateOAuth(token);
}
*/
```

### Full Rollback
```bash
# Revert database migration
supabase db reset

# Redeploy previous version
git revert HEAD
npm run deploy
```

**OAuth won't affect existing API key users** - they'll continue working as before.

---

## 📞 Emergency Contacts

- **Primary:** Your DevOps team
- **Secondary:** support@aistats.ai
- **Supabase Support:** https://supabase.com/dashboard/support

---

## 📈 Success Metrics (Week 1)

Target metrics for first week:

- **Authorization success rate:** >80%
- **Token validation latency:** <20ms p95
- **API request success rate:** >95% (OAuth tokens)
- **Zero security incidents**
- **<10 support tickets related to OAuth**

Monitor daily and adjust as needed.

---

## 🎯 Quick Reference

### Key URLs
- **Authorization:** `https://gateway.aistats.ai/oauth/consent`
- **Token Exchange:** `https://YOUR_PROJECT.supabase.co/auth/v1/oauth/token`
- **JWKS:** `https://YOUR_PROJECT.supabase.co/.well-known/jwks.json`
- **API Base:** `https://gateway.aistats.ai/v1`

### Key Files
- Auth pipeline: `apps/api/src/pipeline/before/auth.ts`
- OAuth validation: `apps/api/src/pipeline/before/oauth.ts`
- Server actions: `apps/web/src/app/(dashboard)/settings/oauth-apps/actions.ts`
- Consent UI: `apps/web/src/app/(auth)/oauth/consent/page.tsx`

### Common Commands
```bash
# Check OAuth apps
supabase db query "SELECT * FROM oauth_app_metadata"

# Check active authorizations
supabase db query "SELECT * FROM oauth_authorizations WHERE revoked_at IS NULL"

# Check OAuth requests
supabase db query "SELECT COUNT(*) FROM gateway_requests WHERE auth_method = 'oauth'"
```

---

**Ready to deploy? Start with the 30-minute Quick Start section above! 🚀**
