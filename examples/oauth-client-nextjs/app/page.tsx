/**
 * Landing Page
 *
 * Shows "Sign in with AI Stats" button to initiate OAuth flow
 */

import { generateAuthUrl } from '@/lib/oauth';
import { isAuthenticated } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function Home() {
  // Redirect to dashboard if already authenticated
  const authenticated = await isAuthenticated();
  if (authenticated) {
    redirect('/dashboard');
  }

  // Generate auth URL server-side
  const authUrl = await generateAuthUrl();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            AI Stats OAuth Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Example OAuth 2.1 integration with PKCE
          </p>
        </div>

        <div className="space-y-6">
          {/* Sign in button */}
          <a
            href={authUrl}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-lg hover:shadow-xl"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Sign in with AI Stats
          </a>

          {/* Feature list */}
          <div className="pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              This demo includes:
            </p>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>OAuth 2.1 authorization code flow</span>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>PKCE (Proof Key for Code Exchange)</span>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Automatic token refresh</span>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Secure session management</span>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>API requests with OAuth tokens</span>
              </li>
            </ul>
          </div>

          {/* Alpha notice */}
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
                  Alpha Demo
                </p>
                <p className="text-yellow-800 dark:text-yellow-300 mt-1">
                  This is a reference implementation. OAuth integration is in alpha.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          <a
            href="https://github.com/your-repo/oauth-client-example"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-700 dark:hover:text-gray-300 underline"
          >
            View source code on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
