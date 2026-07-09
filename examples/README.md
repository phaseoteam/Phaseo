# Phaseo Gateway Examples

This directory contains focused integration examples for different use cases.

## Available Examples

### 1) OAuth Workbench (Next.js)

Path: `examples/oauth-client-nextjs`

Use this when you need:
- OAuth 2.1 + PKCE sign-in flow
- Session-backed access/refresh token handling
- Gateway proxying for control and generation routes
- A browser workbench for testing multiple API surfaces

### 2) Web Chat App (Next.js, API key)

Path: `examples/web-chat-nextjs`

Use this when you need:
- A lightweight chat product integration
- Model discovery from `/v1/models`
- Responses API chat flow without OAuth complexity

### 3) Node Multi-Surface Quickstart (REST)

Path: `examples/gateway-node-quickstart`

Use this when you need:
- Minimal server/client script integration
- Fast smoke checks across control + generation surfaces
- A reference fallback when language SDK availability differs

### 4) Python Multi-Surface Quickstart (REST)

Path: `examples/gateway-python-quickstart`

Use this when you need:
- Python-first control + generation route integration
- No third-party dependencies (stdlib only)
- A clear fallback pattern when SDK/package availability differs

## Which Example Should You Start With?

- Building a signed-in product with user identity: `oauth-client-nextjs`
- Building a straightforward chat UI quickly: `web-chat-nextjs`
- Building backend or CLI automation: `gateway-node-quickstart`
- Building backend or scripting automation in Python: `gateway-python-quickstart`
