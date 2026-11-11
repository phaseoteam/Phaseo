import { isAuthenticated } from '@/lib/session';
import { redirect } from 'next/navigation';

type HomePageProps = {
  searchParams: Promise<{ error?: string; error_description?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const authenticated = await isAuthenticated();
  if (authenticated) {
    redirect('/dashboard');
  }

  const { error, error_description: errorDescription } = await searchParams;

  return (
    <main className="screen centered">
      <section className="card">
        <h1>Phaseo Gateway OAuth Example</h1>
        <p className="muted">
          Sign in with Phaseo to use the Gateway with your own workspace credits: model discovery, Responses API chat,
          and an endpoint tester.
        </p>

        {error && (
          <p className="error" role="alert">
            Sign-in failed: {error}
            {errorDescription ? `. ${errorDescription}` : ''}
          </p>
        )}

        <a href="/api/auth/start" className="button link-button">
          Sign in with Phaseo
        </a>

        <ul className="checklist">
          <li>OAuth 2.1 authorization code flow with PKCE (S256) and the gateway:access scope</li>
          <li>Tokens kept server-side in an encrypted session, refreshed and rotated automatically</li>
          <li>Sign-out revokes the app&apos;s key at Phaseo</li>
          <li>Status routes (`/health`, `/providers`, `/models`) and chat over `/responses`</li>
          <li>Endpoint tester for embeddings, moderation, images, video, OCR and music</li>
        </ul>
      </section>
    </main>
  );
}
