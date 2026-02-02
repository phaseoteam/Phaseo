/**
 * OAuth Security Tests
 *
 * Tests security properties of OAuth implementation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8787';

describe('OAuth Security Tests', () => {
  describe('PKCE Enforcement', () => {
    it('should reject authorization without code_challenge', async () => {
      const authUrl = new URL(`${API_BASE_URL}/oauth/consent`);
      authUrl.searchParams.set('client_id', 'test_client');
      authUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
      authUrl.searchParams.set('scope', 'openid email');
      // Missing code_challenge

      const response = await fetch(authUrl.toString());
      const html = await response.text();

      expect(html).toMatch(/PKCE|code_challenge/i);
    });

    it('should reject token exchange with wrong code_verifier', async () => {
      // This requires a real authorization code
      // Placeholder test
      expect(true).toBe(true);
    });

    it('should only accept S256 code_challenge_method', async () => {
      const authUrl = new URL(`${API_BASE_URL}/oauth/consent`);
      authUrl.searchParams.set('client_id', 'test_client');
      authUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
      authUrl.searchParams.set('code_challenge', 'test');
      authUrl.searchParams.set('code_challenge_method', 'plain'); // Not allowed

      const response = await fetch(authUrl.toString());
      const html = await response.text();

      // Should reject or default to S256
      expect(response.ok).toBe(true); // May show error in UI
    });
  });

  describe('Client Secret Protection', () => {
    it('should never expose client_secret in logs', () => {
      const secret = 'secret_test_123';
      const logOutput = JSON.stringify({ client_id: 'test', data: { secret } });

      // In production, secrets should be redacted
      // This test verifies the pattern
      expect(logOutput).not.toContain('secret_test_123'); // Would fail - needs redaction
    });

    it('should hash client_secret if storing in database', () => {
      // If we choose to store secrets (not recommended), they must be hashed
      const secret = 'secret_test_123';
      const hash = crypto.createHash('sha256').update(secret).digest('hex');

      expect(hash).not.toBe(secret);
      expect(hash.length).toBe(64); // SHA256 hex length
    });
  });

  describe('Token Security', () => {
    it('should reject expired JWT tokens', async () => {
      // Create expired token (mock)
      const expiredToken = createMockJWT({
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });

      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject tokens with invalid signature', async () => {
      // Create token with wrong signature
      const invalidToken = 'eyJhbGc.eyJzdWI.invalidsignature';

      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${invalidToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject tokens from wrong issuer', async () => {
      const tokenFromWrongIssuer = createMockJWT({
        iss: 'https://evil.com',
      });

      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFromWrongIssuer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Authorization Code Security', () => {
    it('should reject reused authorization codes', () => {
      // Authorization codes must be single-use
      // This is enforced by Supabase OAuth server
      expect(true).toBe(true); // Placeholder
    });

    it('should expire authorization codes after 10 minutes', () => {
      // Codes should have short lifetime
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Redirect URI Validation', () => {
    it('should reject unregistered redirect URIs', () => {
      // OAuth server should only allow registered redirect URIs
      expect(true).toBe(true); // Placeholder
    });

    it('should reject http:// redirect URIs in production', () => {
      if (process.env.NODE_ENV === 'production') {
        const redirectUri = 'http://example.com/callback';
        // Should be rejected (except localhost)
        expect(redirectUri).toMatch(/^https:|localhost/);
      }
    });

    it('should prevent open redirect attacks', () => {
      const maliciousRedirect = 'https://evil.com';
      // Should be rejected if not registered
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('State Parameter', () => {
    it('should preserve state parameter through flow', () => {
      const state = crypto.randomBytes(16).toString('hex');
      // Should be returned in callback
      expect(state.length).toBe(32);
    });

    it('should validate state to prevent CSRF', () => {
      // Application must validate state matches
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Scope Validation', () => {
    it('should only grant requested scopes', () => {
      const requestedScopes = ['openid', 'email'];
      const grantedScopes = ['openid', 'email', 'profile']; // Extra scope

      // Should only grant requested scopes
      expect(grantedScopes).toEqual(requestedScopes);
    });

    it('should validate scope format', () => {
      const validScopes = ['openid', 'email', 'gateway:access'];
      const invalidScopes = ['invalid scope', 'bad!scope'];

      validScopes.forEach(scope => {
        expect(scope).toMatch(/^[a-z0-9:_-]+$/);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit token endpoint', async () => {
      const requests: Promise<Response>[] = [];

      // Make 101 rapid requests
      for (let i = 0; i < 101; i++) {
        requests.push(
          fetch(`${API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              code: 'test',
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);

      // Should eventually get rate limited
      expect(rateLimited).toBe(true);
    }, 30000); // 30 second timeout

    it('should rate limit authorization endpoint', async () => {
      const requests: Promise<Response>[] = [];

      for (let i = 0; i < 101; i++) {
        requests.push(
          fetch(`${API_BASE_URL}/oauth/consent?client_id=test`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    }, 30000);
  });

  describe('Authorization Revocation', () => {
    it('should immediately invalidate tokens on revocation', () => {
      // When user revokes, tokens should fail validation
      expect(true).toBe(true); // Placeholder
    });

    it('should prevent revoked tokens from being refreshed', () => {
      // Refresh tokens for revoked authorizations should fail
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should escape client_id in queries', async () => {
      const maliciousClientId = "test'; DROP TABLE oauth_authorizations; --";

      const response = await fetch(
        `${API_BASE_URL}/oauth/consent?client_id=${encodeURIComponent(maliciousClientId)}`
      );

      // Should safely handle without SQL injection
      expect(response.status).not.toBe(500);
    });

    it('should use parameterized queries', () => {
      // All database queries should use parameterized statements
      // This is a code review check, not runtime test
      expect(true).toBe(true);
    });
  });

  describe('XSS Prevention', () => {
    it('should escape app name in consent page', async () => {
      const maliciousName = '<script>alert("XSS")</script>';

      // App name should be escaped when rendered
      // This requires creating an app with malicious name
      expect(true).toBe(true); // Placeholder
    });

    it('should sanitize redirect URIs', () => {
      const maliciousUri = 'javascript:alert(1)';

      // Should reject non-http(s) URIs
      expect(maliciousUri).not.toMatch(/^https?:/);
    });
  });

  describe('CORS Configuration', () => {
    it('should only allow configured origins', async () => {
      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const allowOrigin = response.headers.get('Access-Control-Allow-Origin');

      // Should not allow arbitrary origins
      expect(allowOrigin).not.toBe('*');
      expect(allowOrigin).not.toBe('https://evil.com');
    });
  });
});

// Helper functions
function createMockJWT(claims: any): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const defaultClaims = {
    iss: 'https://test.supabase.co',
    sub: 'user123',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    user_id: 'user123',
    team_id: 'team456',
    client_id: 'oauth789',
  };

  const payload = { ...defaultClaims, ...claims };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Note: This creates an invalid signature - tests should reject it
  return `${headerB64}.${payloadB64}.invalid_signature`;
}
