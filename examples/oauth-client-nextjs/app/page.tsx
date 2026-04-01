import { isAuthenticated } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const authenticated = await isAuthenticated();
  if (authenticated) {
    redirect('/dashboard');
  }

  return (
    <main className="screen centered">
      <section className="card">
        <h1>AI Stats Gateway OAuth Example</h1>
        <p className="muted">
          Sign in to access a complete gateway workbench with model discovery, Responses API chat, and multi-surface endpoint testing.
        </p>

        <a href="/api/auth/start" className="button link-button">
          Sign in with AI Stats
        </a>

        <ul className="checklist">
          <li>OAuth 2.1 + PKCE flow</li>
          <li>Automatic token refresh and session persistence</li>
          <li>Control route integration (`/health`, `/providers`, `/models`, `/gateway/models`)</li>
          <li>Generation surface integration via Responses API and a generic proxy</li>
          <li>Endpoint tester for embeddings, moderation, images, video, OCR, and music</li>
        </ul>
      </section>
    </main>
  );
}
