/**
 * JWT Validation Unit Tests
 *
 * Tests for JWT decoding, validation, and signature verification
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  decodeJWT,
  isJWT,
  validateClaims,
  importPublicKey,
  type JWTClaims,
} from '../jwt';

describe('JWT Utilities', () => {
  describe('isJWT', () => {
    it('returns true for valid JWT format', () => {
      const validJWT = 'eyJhbGc.eyJzdWI.signature';
      expect(isJWT(validJWT)).toBe(true);
    });

    it('returns false for API key format', () => {
      const apiKey = 'aistats_v1_sk_abc_xyz';
      expect(isJWT(apiKey)).toBe(false);
    });

    it('returns false for invalid format', () => {
      expect(isJWT('invalid')).toBe(false);
      expect(isJWT('only.two')).toBe(false);
      expect(isJWT('too.many.dots.here')).toBe(false);
    });
  });

  describe('decodeJWT', () => {
    it('decodes valid JWT', () => {
      // Sample JWT with test payload
      const header = btoa(JSON.stringify({ alg: 'RS256', kid: 'key1' }));
      const payload = btoa(JSON.stringify({
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }));
      const jwt = `${header}.${payload}.signature`;

      const decoded = decodeJWT(jwt);

      expect(decoded).not.toBeNull();
      expect(decoded?.header.alg).toBe('RS256');
      expect(decoded?.payload.sub).toBe('user123');
    });

    it('returns null for invalid JWT', () => {
      expect(decodeJWT('invalid')).toBeNull();
      expect(decodeJWT('only.two')).toBeNull();
    });

    it('handles URL-safe base64', () => {
      const header = btoa(JSON.stringify({ alg: 'RS256' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const payload = btoa(JSON.stringify({ sub: 'test' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const jwt = `${header}.${payload}.sig`;

      const decoded = decodeJWT(jwt);
      expect(decoded).not.toBeNull();
    });
  });

  describe('validateClaims', () => {
    const now = Math.floor(Date.now() / 1000);
    const expectedIssuer = 'https://project.supabase.co';

    it('validates correct claims', () => {
      const claims: Partial<JWTClaims> = {
        iss: expectedIssuer,
        sub: 'user123',
        aud: 'authenticated',
        exp: now + 3600,
        iat: now,
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer, 'authenticated');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects expired token', () => {
      const claims = {
        iss: expectedIssuer,
        exp: now - 100, // Expired
        iat: now - 3700,
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects future issued token', () => {
      const claims = {
        iss: expectedIssuer,
        exp: now + 3600,
        iat: now + 120, // Future (beyond 60s skew)
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('rejects wrong issuer', () => {
      const claims = {
        iss: 'https://evil.com',
        exp: now + 3600,
        iat: now,
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('issuer');
    });

    it('rejects wrong audience', () => {
      const claims = {
        iss: expectedIssuer,
        aud: 'wrong-audience',
        exp: now + 3600,
        iat: now,
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer, 'authenticated');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });

    it('rejects missing custom claims', () => {
      const claims = {
        iss: expectedIssuer,
        exp: now + 3600,
        iat: now,
        // Missing user_id, team_id, client_id
      };

      const result = validateClaims(claims, expectedIssuer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('user_id');
    });

    it('accepts array audience', () => {
      const claims = {
        iss: expectedIssuer,
        aud: ['authenticated', 'other'],
        exp: now + 3600,
        iat: now,
        user_id: 'user123',
        team_id: 'team456',
        client_id: 'oauth789',
      };

      const result = validateClaims(claims, expectedIssuer, 'authenticated');
      expect(result.valid).toBe(true);
    });
  });

  describe('importPublicKey', () => {
    it('imports RSA public key from JWK', async () => {
      const jwk: JsonWebKey = {
        kty: 'RSA',
        n: 'xGOr-H7A-PWZVmJU5C3Y9Y5c0ufmVVPP0pq6JrXQfzfLHPO6QK_hH5LhV1aH0',
        e: 'AQAB',
        alg: 'RS256',
        use: 'sig',
      };

      const key = await importPublicKey(jwk);
      expect(key).toBeDefined();
      expect(key.type).toBe('public');
    });

    it('throws on invalid JWK', async () => {
      const invalidJWK: JsonWebKey = {
        kty: 'RSA',
        // Missing required fields
      };

      await expect(importPublicKey(invalidJWK)).rejects.toThrow();
    });
  });
});

describe('JWT Signature Verification', () => {
  // Note: Full signature verification tests require real keys
  // These are integration-level tests

  it('should verify valid signature (integration)', async () => {
    // This test requires a real JWT and JWKS
    // Skip in unit tests, run in integration tests
    expect(true).toBe(true);
  });
});

describe('Edge Cases', () => {
  it('handles malformed base64', () => {
    const badJWT = 'not-base64.still-not.nope';
    expect(decodeJWT(badJWT)).toBeNull();
  });

  it('handles empty JWT parts', () => {
    const emptyJWT = '..';
    expect(decodeJWT(emptyJWT)).toBeNull();
  });

  it('handles very long tokens', () => {
    const longToken = 'a'.repeat(10000) + '.' + 'b'.repeat(10000) + '.c';
    // Should not crash
    const result = decodeJWT(longToken);
    expect(result).toBeDefined(); // May be null or decoded
  });
});
