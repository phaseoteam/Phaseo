# AI Stats OAuth Client Example (Next.js)

A minimal Next.js application demonstrating OAuth 2.1 integration with AI Stats.

## Features

- ✅ Authorization code flow with PKCE
- ✅ Token exchange and refresh
- ✅ API requests with OAuth bearer tokens
- ✅ Session management
- ✅ Error handling

## Quick Start

### 1. Install Dependencies

```bash
cd examples/oauth-client-nextjs
npm install
```

### 2. Configure Environment

Create `.env.local`:

```bash
# Your OAuth app credentials (from AI Stats dashboard)
NEXT_PUBLIC_OAUTH_CLIENT_ID="your-client-id"
OAUTH_CLIENT_SECRET="your-client-secret"

# AI Stats endpoints
NEXT_PUBLIC_AISTATS_URL="https://your-project.supabase.co"
NEXT_PUBLIC_GATEWAY_URL="https://gateway.aistats.ai"

# Your app's callback URL (must match registered redirect URI)
NEXT_PUBLIC_REDIRECT_URI="http://localhost:3000/auth/callback"

# Session secret (generate with: openssl rand -base64 32)
SESSION_SECRET="your-random-secret-key"
```

### 3. Register OAuth App

1. Go to [AI Stats Dashboard](https://aistats.ai/settings/oauth-apps)
2. Click "Create OAuth App"
3. Fill in:
   - **Name**: My Test App
   - **Redirect URI**: `http://localhost:3000/auth/callback`
   - **Description**: Testing OAuth integration
4. Copy the Client ID and Client Secret
5. Paste them into `.env.local`

### 4. Run the App

```bash
npm run dev
```

Open http://localhost:3000

## How It Works

### 1. User Clicks "Sign in with AI Stats"

```typescript
// app/page.tsx
import { generateAuthUrl } from '@/lib/oauth';

export default function Home() {
  return (
    <a href={generateAuthUrl()}>
      Sign in with AI Stats
    </a>
  );
}
```

### 2. Generate Authorization URL with PKCE

```typescript
// lib/oauth.ts
export function generateAuthUrl(): string {
  // Generate PKCE challenge
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier in session for later use
  storeCodeVerifier(codeVerifier);

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid email profile',
    state: generateRandomString(32),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${process.env.NEXT_PUBLIC_AISTATS_URL}/auth/v1/oauth/authorize?${params}`;
}
```

### 3. User Approves in AI Stats

User is redirected to:
```
https://your-project.supabase.co/oauth/consent?authorization_id=...
```

They review permissions and click "Approve".

### 4. Callback Receives Authorization Code

```typescript
// app/auth/callback/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);

  // Store tokens in session
  await storeSession(tokens);

  // Redirect to dashboard
  return redirect('/dashboard');
}
```

### 5. Exchange Code for Tokens

```typescript
// lib/oauth.ts
export async function exchangeCodeForTokens(code: string) {
  const codeVerifier = getCodeVerifier(); // From session

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_AISTATS_URL}/auth/v1/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI,
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
        code_verifier: codeVerifier,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  return response.json(); // { access_token, refresh_token, expires_in }
}
```

### 6. Make API Requests

```typescript
// app/dashboard/page.tsx
export default async function Dashboard() {
  const session = await getSession();

  // Fetch models from AI Stats gateway
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_GATEWAY_URL}/v1/models`,
    {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  const models = await response.json();

  return <div>{/* Display models */}</div>;
}
```

### 7. Refresh Tokens When Expired

```typescript
// lib/oauth.ts
export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_AISTATS_URL}/auth/v1/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  return response.json(); // { access_token, refresh_token, expires_in }
}
```

## File Structure

```
oauth-client-nextjs/
├── app/
│   ├── page.tsx                    # Landing page with "Sign in" button
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts            # OAuth callback handler
│   ├── dashboard/
│   │   └── page.tsx                # Protected dashboard
│   └── api/
│       └── chat/
│           └── route.ts            # Proxy to AI Stats gateway
├── lib/
│   ├── oauth.ts                    # OAuth utilities (PKCE, token exchange)
│   ├── session.ts                  # Session management
│   └── gateway.ts                  # AI Stats API client
├── components/
│   ├── SignInButton.tsx            # OAuth sign-in button
│   └── ModelSelector.tsx           # Model selection UI
├── .env.local                      # Environment variables (not committed)
├── package.json
└── README.md
```

## API Examples

### Chat Completion

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Streaming

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log(chunk);
}
```

## Security Best Practices

### ✅ DO

- Store client secret in environment variables (server-side only)
- Use PKCE for all authorization flows
- Validate state parameter to prevent CSRF
- Store tokens in httpOnly cookies (not localStorage)
- Refresh tokens before they expire
- Use HTTPS in production
- Validate JWT signatures (if needed)

### ❌ DON'T

- Expose client secret in client-side code
- Store access tokens in localStorage
- Skip PKCE validation
- Trust tokens without validation
- Use implicit grant flow (deprecated)
- Hardcode credentials in source code

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Update redirect URI to production URL
```

### Other Platforms

1. Build the application:
   ```bash
   npm run build
   ```

2. Set environment variables in your platform

3. Update redirect URI in AI Stats OAuth app settings

4. Deploy!

## Troubleshooting

### "Invalid redirect_uri"

**Problem**: Redirect URI doesn't match registered URI

**Solution**:
- Check AI Stats OAuth app settings
- Ensure exact match (including protocol, domain, path)
- Add `http://localhost:3000/auth/callback` for local development

### "Invalid code_verifier"

**Problem**: PKCE verifier doesn't match challenge

**Solution**:
- Ensure code_verifier is stored correctly in session
- Don't refresh page during OAuth flow
- Check PKCE generation matches OAuth 2.1 spec

### "Access token expired"

**Problem**: Token expired (1 hour default)

**Solution**:
- Implement automatic refresh before expiration
- Use refresh token to get new access token
- Handle 401 responses by refreshing and retrying

## Learn More

- [OAuth 2.1 Specification](https://oauth.net/2.1/)
- [PKCE RFC](https://tools.ietf.org/html/rfc7636)
- [AI Stats OAuth Documentation](https://docs.aistats.ai/developers/oauth-integration)
- [Supabase OAuth Guide](https://supabase.com/docs/guides/auth/oauth-server)

## Support

For issues with this example:
- Open an issue on GitHub
- Check the [OAuth Testing Walkthrough](../../OAUTH_TESTING_WALKTHROUGH.md)
- Review [AI Stats OAuth Documentation](https://docs.aistats.ai)

---

**License**: MIT
**Status**: Example/Reference Implementation
