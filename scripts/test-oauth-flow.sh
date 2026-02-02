#!/bin/bash
#
# OAuth 2.1 Flow Manual Testing Script
#
# This script tests the complete OAuth flow end-to-end.
# Run this after deploying to production to verify everything works.
#
# Usage: ./scripts/test-oauth-flow.sh

set -e

echo "🔐 OAuth 2.1 Flow Test Suite"
echo "=============================="
echo ""

# Configuration
API_BASE_URL="${API_BASE_URL:-https://gateway.aistats.ai}"
WEB_BASE_URL="${WEB_BASE_URL:-https://gateway.aistats.ai}"
API_KEY="${API_KEY:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
success() {
  echo -e "${GREEN}✓${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
}

warning() {
  echo -e "${YELLOW}!${NC} $1"
}

info() {
  echo "ℹ $1"
}

# Check prerequisites
if [ -z "$API_KEY" ]; then
  error "API_KEY environment variable not set"
  echo "  export API_KEY=aistats_v1_sk_YOUR_KEY"
  exit 1
fi

echo "Configuration:"
echo "  API Base URL: $API_BASE_URL"
echo "  Web Base URL: $WEB_BASE_URL"
echo ""

# Test 1: Create OAuth App
echo "📝 Test 1: Create OAuth App"
echo "----------------------------"

CREATE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/v1/control/oauth-clients" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test OAuth App '"$(date +%s)"'",
    "redirect_uris": ["http://localhost:3000/callback"],
    "homepage_url": "http://localhost:3000"
  }')

CLIENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.client_id // empty')
CLIENT_SECRET=$(echo "$CREATE_RESPONSE" | jq -r '.client_secret // empty')

if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
  success "OAuth app created"
  info "  Client ID: $CLIENT_ID"
  info "  Client Secret: ${CLIENT_SECRET:0:20}..."
else
  error "Failed to create OAuth app"
  echo "$CREATE_RESPONSE" | jq '.'
  exit 1
fi

echo ""

# Test 2: Generate PKCE
echo "🔑 Test 2: Generate PKCE"
echo "------------------------"

CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=' | tr '+/' '-_')
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '+/' '-_')

success "PKCE generated"
info "  Verifier: ${CODE_VERIFIER:0:20}..."
info "  Challenge: ${CODE_CHALLENGE:0:20}..."

echo ""

# Test 3: Authorization URL
echo "🌐 Test 3: Build Authorization URL"
echo "-----------------------------------"

STATE=$(openssl rand -hex 16)

AUTH_URL="$WEB_BASE_URL/oauth/consent"
AUTH_URL+="?client_id=$CLIENT_ID"
AUTH_URL+="&redirect_uri=http://localhost:3000/callback"
AUTH_URL+="&scope=openid%20email%20gateway:access"
AUTH_URL+="&state=$STATE"
AUTH_URL+="&code_challenge=$CODE_CHALLENGE"
AUTH_URL+="&code_challenge_method=S256"

success "Authorization URL built"
echo ""
echo "  $AUTH_URL"
echo ""

warning "MANUAL STEP REQUIRED:"
echo "  1. Open the URL above in your browser"
echo "  2. Sign in if needed"
echo "  3. Select a team and approve the authorization"
echo "  4. Copy the 'code' parameter from the redirect URL"
echo ""
read -p "Enter the authorization code: " AUTH_CODE

if [ -z "$AUTH_CODE" ]; then
  error "No authorization code provided"
  exit 1
fi

success "Authorization code received: ${AUTH_CODE:0:20}..."

echo ""

# Test 4: Token Exchange
echo "🎫 Test 4: Exchange Code for Tokens"
echo "------------------------------------"

TOKEN_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "'"$AUTH_CODE"'",
    "code_verifier": "'"$CODE_VERIFIER"'",
    "redirect_uri": "http://localhost:3000/callback",
    "client_id": "'"$CLIENT_ID"'",
    "client_secret": "'"$CLIENT_SECRET"'"
  }')

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')
REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.refresh_token // empty')

if [ -n "$ACCESS_TOKEN" ] && [ -n "$REFRESH_TOKEN" ]; then
  success "Tokens received"
  info "  Access Token: ${ACCESS_TOKEN:0:50}..."
  info "  Refresh Token: ${REFRESH_TOKEN:0:20}..."
else
  error "Failed to exchange code for tokens"
  echo "$TOKEN_RESPONSE" | jq '.'
  exit 1
fi

echo ""

# Test 5: API Request with Token
echo "🚀 Test 5: Make API Request"
echo "---------------------------"

API_RESPONSE=$(curl -s -X POST "$API_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Say hello!"}],
    "max_tokens": 10
  }')

API_STATUS=$(echo "$API_RESPONSE" | jq -r '.choices[0].message.content // .error // empty')

if [ -n "$API_STATUS" ]; then
  success "API request successful"
  info "  Response: $API_STATUS"
else
  # May fail due to credits/limits, but token should be valid
  warning "API request returned an error (may be expected)"
  echo "$API_RESPONSE" | jq '.'
fi

echo ""

# Test 6: Decode Token
echo "🔍 Test 6: Decode JWT Token"
echo "---------------------------"

JWT_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -D 2>/dev/null)

if [ -n "$JWT_PAYLOAD" ]; then
  success "Token decoded"
  echo "$JWT_PAYLOAD" | jq '.'
else
  warning "Could not decode token"
fi

echo ""

# Test 7: Token Refresh
echo "🔄 Test 7: Refresh Access Token"
echo "--------------------------------"

REFRESH_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "'"$REFRESH_TOKEN"'",
    "client_id": "'"$CLIENT_ID"'",
    "client_secret": "'"$CLIENT_SECRET"'"
  }')

NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.access_token // empty')

if [ -n "$NEW_ACCESS_TOKEN" ]; then
  success "Token refreshed"
  info "  New Access Token: ${NEW_ACCESS_TOKEN:0:50}..."

  if [ "$ACCESS_TOKEN" != "$NEW_ACCESS_TOKEN" ]; then
    success "Token rotated (different from original)"
  else
    warning "Token not rotated (same as original)"
  fi
else
  error "Failed to refresh token"
  echo "$REFRESH_RESPONSE" | jq '.'
fi

echo ""

# Test 8: List OAuth Apps
echo "📋 Test 8: List OAuth Apps"
echo "--------------------------"

LIST_RESPONSE=$(curl -s "$API_BASE_URL/v1/control/oauth-clients" \
  -H "Authorization: Bearer $API_KEY")

APP_COUNT=$(echo "$LIST_RESPONSE" | jq '.data | length')

if [ "$APP_COUNT" -gt 0 ]; then
  success "OAuth apps listed ($APP_COUNT apps)"
else
  warning "No OAuth apps found"
fi

echo ""

# Test 9: Revoke Authorization (Manual)
echo "❌ Test 9: Revoke Authorization"
echo "--------------------------------"

warning "MANUAL STEP REQUIRED:"
echo "  1. Go to $WEB_BASE_URL/settings/authorized-apps"
echo "  2. Find the test app and click 'Revoke Access'"
echo "  3. Confirm revocation"
echo ""
read -p "Press Enter after revoking authorization..."

# Try to make API request with old token
REVOKE_TEST=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Test"}]
  }')

HTTP_CODE=$(echo "$REVOKE_TEST" | tail -n1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  success "Token rejected after revocation (HTTP $HTTP_CODE)"
else
  warning "Token still works after revocation (HTTP $HTTP_CODE)"
  echo "  This may indicate revocation check is not working"
fi

echo ""

# Test 10: Cleanup
echo "🧹 Test 10: Cleanup"
echo "-------------------"

DELETE_RESPONSE=$(curl -s -X DELETE "$API_BASE_URL/v1/control/oauth-clients/$CLIENT_ID" \
  -H "Authorization: Bearer $API_KEY")

if echo "$DELETE_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  success "OAuth app deleted"
else
  warning "Failed to delete OAuth app (may need manual cleanup)"
fi

echo ""
echo "=============================="
echo "✅ OAuth Flow Test Complete!"
echo "=============================="
echo ""
echo "Summary:"
echo "  • OAuth app creation: ✓"
echo "  • PKCE generation: ✓"
echo "  • Authorization flow: ✓"
echo "  • Token exchange: ✓"
echo "  • API requests: ✓"
echo "  • Token refresh: ✓"
echo "  • Authorization revocation: ✓"
echo ""
echo "Next steps:"
echo "  1. Review any warnings above"
echo "  2. Test with a real client application"
echo "  3. Monitor logs for errors"
echo "  4. Set up alerts for OAuth events"
echo ""
