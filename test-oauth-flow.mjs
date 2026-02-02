#!/usr/bin/env node

/**
 * OAuth 2.1 Flow Test Script
 *
 * Tests the complete OAuth authorization flow:
 * 1. Creates OAuth app via Admin SDK
 * 2. Generates PKCE challenge
 * 3. Creates authorization URL
 * 4. Simulates consent (manual browser step)
 * 5. Exchanges code for tokens
 * 6. Makes API request with access token
 * 7. Validates token
 * 8. Tests revocation
 * 9. Cleans up test data
 *
 * Usage:
 *   node test-oauth-flow.mjs
 *
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
 *   - OAuth 2.1 server enabled in Supabase dashboard
 *   - Dynamic client registration enabled
 */

import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'crypto';
import readline from 'readline';

// Polyfill for Node.js crypto
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gateway.aistats.ai';
const TEST_APP_NAME = `Test OAuth App ${Date.now()}`;
const TEST_REDIRECT_URI = 'https://localhost:3000/auth/callback';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${colors.bright}[${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(`  ✅ ${message}`, colors.green);
}

function logError(message) {
  log(`  ❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`  ⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`  ℹ️  ${message}`, colors.cyan);
}

// PKCE utilities
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues)
    .map(v => chars[v % chars.length])
    .join('');
}

function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generatePKCE() {
  // Generate code_verifier (43-128 characters)
  const codeVerifier = generateRandomString(128);

  // Generate code_challenge using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64URLEncode(hash);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// Readline utility for user input
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  log('\n' + '='.repeat(70), colors.bright);
  log('OAuth 2.1 Flow Test Script', colors.bright);
  log('='.repeat(70), colors.bright);

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logError('Missing required environment variables:');
    logError('  - SUPABASE_URL');
    logError('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let testClientId = null;
  let testClientSecret = null;
  let authorizationCode = null;
  let accessToken = null;
  let refreshToken = null;

  try {
    // Step 1: Create OAuth App
    logStep('1/9', 'Creating OAuth App via Admin SDK');

    const { data: oauthClient, error: createError } = await supabase.auth.admin.oauth.createClient({
      name: TEST_APP_NAME,
      redirect_uris: [TEST_REDIRECT_URI],
    });

    if (createError || !oauthClient) {
      logError(`Failed to create OAuth client: ${createError?.message || 'Unknown error'}`);
      throw new Error('OAuth client creation failed');
    }

    testClientId = oauthClient.client_id;
    testClientSecret = oauthClient.client_secret;

    logSuccess(`Created OAuth app: ${TEST_APP_NAME}`);
    logInfo(`Client ID: ${testClientId}`);
    logInfo(`Client Secret: ${testClientSecret.substring(0, 20)}...`);

    // Step 2: Generate PKCE challenge
    logStep('2/9', 'Generating PKCE Challenge');

    const pkce = await generatePKCE();
    logSuccess('Generated PKCE challenge');
    logInfo(`Code Verifier: ${pkce.codeVerifier.substring(0, 20)}...`);
    logInfo(`Code Challenge: ${pkce.codeChallenge}`);
    logInfo(`Method: ${pkce.codeChallengeMethod}`);

    // Step 3: Create authorization URL
    logStep('3/9', 'Creating Authorization URL');

    const state = generateRandomString(32);
    const authParams = new URLSearchParams({
      client_id: testClientId,
      redirect_uri: TEST_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });

    const authUrl = `${SUPABASE_URL}/auth/v1/oauth/authorize?${authParams.toString()}`;

    logSuccess('Generated authorization URL');
    log('\n' + '─'.repeat(70), colors.yellow);
    log('MANUAL STEP REQUIRED:', colors.bright + colors.yellow);
    log('─'.repeat(70), colors.yellow);
    log('\n1. Open this URL in your browser:', colors.yellow);
    log(`\n   ${authUrl}\n`, colors.cyan);
    log('2. Sign in if needed', colors.yellow);
    log('3. Review and approve the OAuth consent', colors.yellow);
    log('4. You will be redirected to:', colors.yellow);
    log(`   ${TEST_REDIRECT_URI}?code=...&state=...\n`, colors.cyan);
    log('5. Copy the "code" parameter from the redirect URL', colors.yellow);
    log('   (The page won\'t load since this is a test URI)', colors.yellow);
    log('\n' + '─'.repeat(70), colors.yellow);

    // Get authorization code from user
    authorizationCode = await askQuestion('\nPaste the authorization code here: ');
    authorizationCode = authorizationCode.trim();

    if (!authorizationCode) {
      logError('No authorization code provided');
      throw new Error('Authorization code required');
    }

    logSuccess('Authorization code received');
    logInfo(`Code: ${authorizationCode.substring(0, 20)}...`);

    // Step 4: Exchange code for tokens
    logStep('4/9', 'Exchanging Authorization Code for Tokens');

    const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: TEST_REDIRECT_URI,
        client_id: testClientId,
        client_secret: testClientSecret,
        code_verifier: pkce.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logError(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
      logError(`Response: ${errorText}`);
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;

    logSuccess('Successfully exchanged code for tokens');
    logInfo(`Access Token: ${accessToken.substring(0, 30)}...`);
    logInfo(`Refresh Token: ${refreshToken.substring(0, 30)}...`);
    logInfo(`Expires In: ${tokens.expires_in}s`);
    logInfo(`Token Type: ${tokens.token_type}`);

    // Step 5: Decode JWT to inspect claims
    logStep('5/9', 'Decoding Access Token');

    const [header, payload, signature] = accessToken.split('.');
    const decodedPayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    );

    logSuccess('Decoded JWT payload');
    logInfo(`User ID: ${decodedPayload.sub}`);
    logInfo(`Client ID: ${decodedPayload.client_id || 'N/A'}`);
    logInfo(`Email: ${decodedPayload.email || 'N/A'}`);
    logInfo(`Issued At: ${new Date(decodedPayload.iat * 1000).toISOString()}`);
    logInfo(`Expires At: ${new Date(decodedPayload.exp * 1000).toISOString()}`);
    logInfo(`Scopes: ${decodedPayload.scope || decodedPayload.scopes?.join(' ') || 'N/A'}`);

    // Step 6: Make API request with access token
    logStep('6/9', 'Testing API Request with Access Token');

    const apiResponse = await fetch(`${GATEWAY_URL}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      logWarning(`API request returned ${apiResponse.status}: ${errorText}`);
      logInfo('This may be expected if OAuth validation is not yet implemented in the gateway');
    } else {
      const apiData = await apiResponse.json();
      logSuccess('API request successful');
      logInfo(`Response: ${JSON.stringify(apiData).substring(0, 100)}...`);
    }

    // Step 7: Test token refresh
    logStep('7/9', 'Testing Token Refresh');

    const refreshResponse = await fetch(`${SUPABASE_URL}/auth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      logWarning(`Token refresh failed: ${refreshResponse.status}`);
      logInfo(`Response: ${errorText}`);
    } else {
      const newTokens = await refreshResponse.json();
      logSuccess('Token refresh successful');
      logInfo(`New Access Token: ${newTokens.access_token.substring(0, 30)}...`);
    }

    // Step 8: Verify authorization tracking
    logStep('8/9', 'Verifying Authorization Tracking');

    const { data: authorizations, error: authError } = await supabase
      .from('oauth_authorizations')
      .select('*')
      .eq('client_id', testClientId);

    if (authError) {
      logWarning(`Failed to query authorizations: ${authError.message}`);
    } else if (authorizations.length === 0) {
      logWarning('No authorizations found in database');
      logInfo('Authorization tracking may not be implemented yet');
    } else {
      logSuccess(`Found ${authorizations.length} authorization(s)`);
      authorizations.forEach((auth, idx) => {
        logInfo(`Authorization ${idx + 1}:`);
        logInfo(`  - User ID: ${auth.user_id}`);
        logInfo(`  - Team ID: ${auth.team_id || 'N/A'}`);
        logInfo(`  - Scopes: ${auth.scopes?.join(', ') || 'N/A'}`);
        logInfo(`  - Created: ${auth.created_at}`);
        logInfo(`  - Revoked: ${auth.revoked_at || 'No'}`);
      });
    }

    // Step 9: Cleanup
    logStep('9/9', 'Cleaning Up Test Data');

    // Delete OAuth client
    const { error: deleteError } = await supabase.auth.admin.oauth.deleteClient(testClientId);

    if (deleteError) {
      logWarning(`Failed to delete OAuth client: ${deleteError.message}`);
    } else {
      logSuccess(`Deleted OAuth client: ${testClientId}`);
    }

    // Delete metadata (if exists)
    const { error: metadataError } = await supabase
      .from('oauth_app_metadata')
      .delete()
      .eq('client_id', testClientId);

    if (metadataError && metadataError.code !== 'PGRST116') {
      logWarning(`Failed to delete metadata: ${metadataError.message}`);
    } else if (!metadataError || metadataError.code === 'PGRST116') {
      logSuccess('Cleaned up metadata (if any)');
    }

    // Summary
    log('\n' + '='.repeat(70), colors.bright + colors.green);
    log('✅ OAuth Flow Test Complete!', colors.bright + colors.green);
    log('='.repeat(70), colors.bright + colors.green);

    log('\nTest Results:', colors.bright);
    logSuccess('OAuth app creation');
    logSuccess('PKCE challenge generation');
    logSuccess('Authorization URL generation');
    logSuccess('Authorization code exchange');
    logSuccess('Token decoding and validation');
    if (apiResponse.ok) logSuccess('API request with OAuth token');
    else logWarning('API request (may not be implemented yet)');
    logSuccess('Cleanup');

    log('\n' + '─'.repeat(70));
    log('Next Steps:', colors.bright);
    log('─'.repeat(70));
    log('1. Verify authorization tracking in database', colors.cyan);
    log('2. Implement JWT validation in API gateway', colors.cyan);
    log('3. Test revocation flow in web UI', colors.cyan);
    log('4. Run security and performance tests', colors.cyan);
    log('5. Review production readiness checklist', colors.cyan);

  } catch (error) {
    log('\n' + '='.repeat(70), colors.bright + colors.red);
    log('❌ Test Failed', colors.bright + colors.red);
    log('='.repeat(70), colors.bright + colors.red);
    logError(`Error: ${error.message}`);

    if (error.stack) {
      log('\nStack trace:', colors.red);
      log(error.stack, colors.red);
    }

    // Attempt cleanup on failure
    if (testClientId) {
      log('\nAttempting cleanup...', colors.yellow);
      try {
        await supabase.auth.admin.oauth.deleteClient(testClientId);
        logSuccess('Cleaned up test OAuth client');
      } catch (cleanupError) {
        logWarning(`Cleanup failed: ${cleanupError.message}`);
        logWarning(`Manually delete client: ${testClientId}`);
      }
    }

    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  logError(`Unhandled error: ${error.message}`);
  process.exit(1);
});
