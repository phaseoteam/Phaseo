#!/bin/bash
# Helper script to run SDK compatibility tests with proper setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "ðŸ§ª AI Stats Gateway - SDK Compatibility Tests"
echo "=============================================="
echo ""

# Check if environment variables are set
if [ -z "$GATEWAY_BASE_URL" ]; then
    echo -e "${YELLOW}[WARN]  GATEWAY_BASE_URL not set${NC}"
    echo "   Please set: export GATEWAY_BASE_URL=http://localhost:8787"
    echo ""
fi

if [ -z "$GATEWAY_API_KEY" ]; then
    echo -e "${YELLOW}[WARN]  GATEWAY_API_KEY not set${NC}"
    echo "   Please set: export GATEWAY_API_KEY=your_gateway_key"
    echo ""
fi

if [ -z "$GATEWAY_BASE_URL" ] || [ -z "$GATEWAY_API_KEY" ]; then
    echo -e "${RED}[FAIL] Missing required environment variables${NC}"
    echo ""
    echo "Quick setup:"
    echo "  export GATEWAY_BASE_URL=http://localhost:8787"
    echo "  export GATEWAY_API_KEY=gw_test123"
    echo "  ./tests/sdk/run-sdk-tests.sh"
    echo ""
    exit 1
fi

echo -e "${GREEN}[OK] Environment variables configured${NC}"
echo "  GATEWAY_BASE_URL: $GATEWAY_BASE_URL"
echo "  GATEWAY_API_KEY: ${GATEWAY_API_KEY:0:10}..."
echo ""

# Check if gateway is reachable
echo "ðŸ” Checking gateway connectivity..."
if curl -s -f -o /dev/null "$GATEWAY_BASE_URL/health" 2>/dev/null; then
    echo -e "${GREEN}[OK] Gateway is reachable${NC}"
else
    echo -e "${RED}[FAIL] Cannot reach gateway at $GATEWAY_BASE_URL${NC}"
    echo ""
    echo "Make sure the gateway is running:"
    echo "  pnpm --dir apps/api dev"
    echo ""
    exit 1
fi

echo ""
echo "ðŸ§ª Running SDK compatibility tests..."
echo ""

# Determine which tests to run based on argument
case "${1:-all}" in
    openai)
        echo "Running OpenAI SDK tests only..."
        pnpm run test tests/sdk/openai-sdk-compat
        ;;
    anthropic)
        echo "Running Anthropic SDK tests only..."
        pnpm run test tests/sdk/anthropic-sdk-compat
        ;;
    all)
        echo "Running all SDK tests..."
        pnpm run test tests/sdk
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Usage: $0 [openai|anthropic|all]"
        exit 1
        ;;
esac

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}[PASS] All SDK tests passed!${NC}"
else
    echo -e "${RED}[FAIL] Some tests failed${NC}"
    exit $RESULT
fi
