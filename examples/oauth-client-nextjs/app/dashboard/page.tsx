/**
 * Protected Dashboard
 *
 * Displays user info and makes API requests with OAuth token
 */

import { isAuthenticated, getUser, getTokens } from '@/lib/session';
import { redirect } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.aistats.ai';

export default async function Dashboard() {
  // Require authentication
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect('/?error=unauthorized');
  }

  const user = await getUser();
  const tokens = await getTokens();

  // Fetch available models (example API call)
  let models = null;
  let modelsError = null;

  try {
    const response = await fetch(`${GATEWAY_URL}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${tokens?.access_token}`,
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      models = data.data || data;
    } else {
      modelsError = `API returned ${response.status}`;
    }
  } catch (error) {
    modelsError = error instanceof Error ? error.message : 'Unknown error';
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dashboard
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Authenticated via OAuth 2.1
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* User Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              User Information
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Email
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {user?.email || 'N/A'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  User ID
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                  {user?.id || 'N/A'}
                </dd>
              </div>
              {user?.name && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Name
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {user.name}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Token Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Access Token
            </h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Token (first 50 chars)
                </dt>
                <dd className="mt-1 text-xs text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded break-all">
                  {tokens?.access_token?.substring(0, 50)}...
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Expires At
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {tokens?.expires_at
                    ? new Date(tokens.expires_at).toLocaleString()
                    : 'N/A'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Time Remaining
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {tokens?.expires_at
                    ? `${Math.round((tokens.expires_at - Date.now()) / 1000 / 60)} minutes`
                    : 'N/A'}
                </dd>
              </div>
            </dl>
          </div>

          {/* API Test Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              API Test: List Models
            </h2>

            {modelsError ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div className="text-sm">
                    <p className="font-semibold text-yellow-900 dark:text-yellow-200">
                      API Request Failed
                    </p>
                    <p className="text-yellow-800 dark:text-yellow-300 mt-1">
                      {modelsError}
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-400 mt-2 text-xs">
                      This may be expected if OAuth validation is not yet implemented in the gateway.
                    </p>
                  </div>
                </div>
              </div>
            ) : models ? (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Successfully fetched {Array.isArray(models) ? models.length : Object.keys(models).length} models using OAuth token
                </p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-auto max-h-96">
                  {JSON.stringify(models, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Loading...</p>
            )}
          </div>

          {/* Example Chat Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Chat Completion Example
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Example API request using your OAuth token:
            </p>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-auto">
{`curl -X POST ${GATEWAY_URL}/v1/chat/completions \\
  -H "Authorization: Bearer ${tokens?.access_token?.substring(0, 30)}..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
