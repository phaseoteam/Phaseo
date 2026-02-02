/**
 * Sign Out Button Component
 *
 * Clears session and redirects to home page
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);

    try {
      // Call sign-out API route
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/');
        router.refresh();
      } else {
        console.error('Sign out failed');
        setLoading(false);
      }
    } catch (error) {
      console.error('Sign out error:', error);
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {loading ? 'Signing out...' : 'Sign Out'}
    </button>
  );
}
