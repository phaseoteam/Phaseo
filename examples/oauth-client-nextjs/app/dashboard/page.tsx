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
          <h1>Phaseo Gateway Integration Workbench</h1>
          <p className="muted">
            Gateway requests run through a server-side proxy with the signed-in person&apos;s OAuth token.
          </p>
          {user?.email && <p className="muted">Signed in as: {user.email}</p>}
        </div>
        <SignOutButton />
      </header>

      <GatewayWorkbench />
    </main>
  );
}
