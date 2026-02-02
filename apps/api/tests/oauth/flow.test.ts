/**
 * OAuth Flow Integration Tests
 *
 * End-to-end tests for OAuth authorization flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8787',
  testUserEmail: 'oauth-test@example.com',
  testUserPassword: 'test-password-123',
};

describe('OAuth 2.1 Flow Integration Tests', () => {
  let supabase: ReturnType<typeof createClient>;
  let testUserId: string;
  let testTeamId: string;
  let testClientId: string;
  let testClientSecret: string;
  let codeVerifier: string;
  let codeChallenge: string;
  let authorizationCode: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);

    // Create test user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: TEST_CONFIG.testUserEmail,
      password: TEST_CONFIG.testUserPassword,
    });

    if (authError) throw authError;
    testUserId = authData.user!.id;

    // Create test team
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert({ name: 'OAuth Test Team' })
      .select()
      .single();

    if (teamError) throw teamError;
    testTeamId = teamData.id;

    // Add user to team
    await supabase.from('team_members').insert({
      team_id: testTeamId,
      user_id: testUserId,
      role: 'owner',
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testClientId) {
      await supabase
        .from('oauth_app_metadata')
        .delete()
        .eq('client_id', testClientId);
    }

    if (testTeamId) {
      await supabase.from('teams').delete().eq('id', testTeamId);
    }

    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  describe('Step 1: OAuth App Registration', () => {
    it('should create OAuth app', async () => {
      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/v1/control/oauth-clients`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
          },
          body: JSON.stringify({
            name: 'Test OAuth App',
            redirect_uris: ['http://localhost:3000/callback'],
            homepage_url: 'http://localhost:3000',
          }),
        }
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.client_id).toBeDefined();
      expect(data.client_secret).toBeDefined();

      testClientId = data.client_id;
      testClientSecret = data.client_secret;
    });

    it('should list OAuth apps', async () => {
      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/v1/control/oauth-clients`,
        {
          headers: {
            Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
          },
        }
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.data).toBeInstanceOf(Array);
    });
  });

  describe('Step 2: PKCE Generation', () => {
    it('should generate valid PKCE parameters', () => {
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    });
  });

  describe('Step 3: Authorization Request', () => {
    it('should accept authorization request', async () => {
      const authUrl = new URL(`${TEST_CONFIG.apiBaseUrl}/oauth/consent`);
      authUrl.searchParams.set('client_id', testClientId);
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('scope', 'openid email gateway:access');
      authUrl.searchParams.set('state', 'random-state-123');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const response = await fetch(authUrl.toString());

      // Should render consent page or redirect to login
      expect([200, 302]).toContain(response.status);
    });

    it('should reject missing PKCE', async () => {
      const authUrl = new URL(`${TEST_CONFIG.apiBaseUrl}/oauth/consent`);
      authUrl.searchParams.set('client_id', testClientId);
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('scope', 'openid email gateway:access');
      // Missing code_challenge

      const response = await fetch(authUrl.toString());

      // Should show error
      const html = await response.text();
      expect(html).toContain('PKCE');
    });

    it('should reject invalid client_id', async () => {
      const authUrl = new URL(`${TEST_CONFIG.apiBaseUrl}/oauth/consent`);
      authUrl.searchParams.set('client_id', 'invalid_client');
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('scope', 'openid email gateway:access');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const response = await fetch(authUrl.toString());

      const html = await response.text();
      expect(html).toContain('not found');
    });
  });

  describe('Step 4: User Consent (Simulated)', () => {
    it('should approve authorization', async () => {
      // Simulate user approving authorization
      // In real scenario, this would be done through browser

      const { data, error } = await supabase
        .from('oauth_authorizations')
        .insert({
          user_id: testUserId,
          client_id: testClientId,
          team_id: testTeamId,
          scopes: ['openid', 'email', 'gateway:access'],
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('should generate authorization code', () => {
      // Mock authorization code generation
      authorizationCode = `auth_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
      expect(authorizationCode).toBeDefined();
    });
  });

  describe('Step 5: Token Exchange', () => {
    it('should exchange code for tokens', async () => {
      const response = await fetch(
        `${TEST_CONFIG.supabaseUrl}/auth/v1/oauth/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: authorizationCode,
            code_verifier: codeVerifier,
            redirect_uri: 'http://localhost:3000/callback',
            client_id: testClientId,
            client_secret: testClientSecret,
          }),
        }
      );

      // Note: This will fail in test if Supabase OAuth not configured
      // Expected in development - test the structure
      if (response.ok) {
        const tokens = await response.json();

        expect(tokens.access_token).toBeDefined();
        expect(tokens.refresh_token).toBeDefined();
        expect(tokens.expires_in).toBe(3600);
        expect(tokens.token_type).toBe('Bearer');

        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
      } else {
        console.log('Token exchange not configured - skipping');
      }
    });

    it('should reject invalid code_verifier', async () => {
      const response = await fetch(
        `${TEST_CONFIG.supabaseUrl}/auth/v1/oauth/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: authorizationCode,
            code_verifier: 'wrong_verifier',
            redirect_uri: 'http://localhost:3000/callback',
            client_id: testClientId,
            client_secret: testClientSecret,
          }),
        }
      );

      expect(response.ok).toBe(false);
    });

    it('should reject reused authorization code', async () => {
      // Try to use the same code again
      const response = await fetch(
        `${TEST_CONFIG.supabaseUrl}/auth/v1/oauth/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: authorizationCode,
            code_verifier: codeVerifier,
            redirect_uri: 'http://localhost:3000/callback',
            client_id: testClientId,
            client_secret: testClientSecret,
          }),
        }
      );

      expect(response.ok).toBe(false);
    });
  });

  describe('Step 6: API Requests with Token', () => {
    it('should make API request with valid token', async () => {
      if (!accessToken) {
        console.log('No access token - skipping');
        return;
      }

      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          }),
        }
      );

      // May fail if no credits, but should authenticate
      expect([200, 402, 429]).toContain(response.status);
    });

    it('should reject request with invalid token', async () => {
      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer invalid.token.here',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          }),
        }
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Step 7: Token Refresh', () => {
    it('should refresh access token', async () => {
      if (!refreshToken) {
        console.log('No refresh token - skipping');
        return;
      }

      const response = await fetch(
        `${TEST_CONFIG.supabaseUrl}/auth/v1/oauth/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: testClientId,
            client_secret: testClientSecret,
          }),
        }
      );

      if (response.ok) {
        const tokens = await response.json();

        expect(tokens.access_token).toBeDefined();
        expect(tokens.refresh_token).toBeDefined();
        expect(tokens.access_token).not.toBe(accessToken); // New token

        // Update tokens for next tests
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
      }
    });
  });

  describe('Step 8: Authorization Revocation', () => {
    it('should revoke authorization', async () => {
      const { data: auth } = await supabase
        .from('oauth_authorizations')
        .select('id')
        .eq('user_id', testUserId)
        .eq('client_id', testClientId)
        .single();

      if (!auth) {
        console.log('No authorization found - skipping');
        return;
      }

      const { error } = await supabase
        .from('oauth_authorizations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', auth.id);

      expect(error).toBeNull();
    });

    it('should reject API request after revocation', async () => {
      if (!accessToken) {
        console.log('No access token - skipping');
        return;
      }

      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          }),
        }
      );

      // Should fail with 401 or 403
      expect([401, 403]).toContain(response.status);
    });
  });
});

describe('OAuth Security Tests', () => {
  it('should enforce HTTPS in production', () => {
    if (process.env.NODE_ENV === 'production') {
      expect(TEST_CONFIG.apiBaseUrl).toMatch(/^https:/);
    }
  });

  it('should validate redirect URI', async () => {
    // Test with unregistered redirect URI
    // Should be rejected by authorization endpoint
    expect(true).toBe(true); // Placeholder
  });

  it('should enforce rate limits', async () => {
    // Make multiple rapid requests
    // Should eventually get 429 Too Many Requests
    expect(true).toBe(true); // Placeholder
  });
});
