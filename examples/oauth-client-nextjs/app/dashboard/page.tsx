import { isAuthenticated, getUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';
import GatewayWorkbench from './GatewayWorkbench';

export default async function DashboardPage() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect('/?error=unauthorized');
  }

  const user = await getUser();

  return (
    <main className="screen">
      <header className="header">
        <div>
          <h1>AI Stats Gateway Integration Workbench</h1>
          <p className="muted">
            Complete OAuth-backed integration for control routes and generation surfaces.
          </p>
          {user?.email && <p className="muted">Signed in as: {user.email}</p>}
        </div>
        <SignOutButton />
      </header>

      <GatewayWorkbench />
    </main>
  );
}
