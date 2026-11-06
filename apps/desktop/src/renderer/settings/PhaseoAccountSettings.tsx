import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { PhaseoSignInForm } from "../components/PhaseoSignInForm";
import { HarnessLogo } from "../components/HarnessLogo";
import { Button } from "../components/ui/button";
import { SettingsPageLayout } from "./SettingsLayout";

export function PhaseoAccountSettings() {
	const { overview, setOverview, openSettings } = useWorkspace();
	const accounts = overview.accounts.filter(account => account.harness === "phaseo" && account.oauthExpiresAt && !account.archived);
	const [adding, setAdding] = useState(false);
	const [accountId, setAccountId] = useState<string>();
	const close = () => { setAdding(false); setAccountId(undefined); };
	const showForm = !accounts.length || adding || !!accountId;
	return <SettingsPageLayout title="Phaseo account" description="Use your Phaseo account and credits to chat with models from every major lab.">
		{accounts.length > 0 && <section aria-label="Phaseo accounts" className="flex flex-col gap-4">
			<div className="divide-y divide-border border-y border-border">
				{accounts.map(account => <div key={account.id} className="flex flex-wrap items-center gap-3 py-4">
					<HarnessLogo harness="phaseo" />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">{account.profile?.name ?? account.name}</p>
						{account.profile?.email && <p className="truncate text-xs text-muted-foreground">{account.profile.email}</p>}
						<p className="mt-1 text-xs text-muted-foreground">{Date.parse(account.oauthExpiresAt!) <= Date.now() ? "Sign-in expired" : "Signed in"}</p>
					</div>
					<Button variant="outline" size="sm" onClick={() => { setAdding(false); setAccountId(account.id); }}>Sign in again</Button>
				</div>)}
			</div>
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onClick={() => void window.phaseoDesktop?.openExternal("https://phaseo.app/settings/account")}>Manage account<ExternalLink /></Button>
				{!showForm && <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus />Add another account</Button>}
			</div>
		</section>}
		{showForm && <section aria-label="Sign in to Phaseo" className="w-full max-w-sm">
			{accounts.length > 0 && <h2 className="mb-5 text-sm font-semibold">{accountId ? "Sign in again" : "Add a Phaseo account"}</h2>}
			<PhaseoSignInForm key={accountId ?? "new"} accountId={accountId} onCancel={accounts.length ? close : undefined} onConnected={workspace => { setOverview(workspace); close(); }} />
		</section>}
		<p className="text-xs text-muted-foreground">Agent subscriptions and API keys are in <button type="button" className="font-medium text-foreground hover:underline" onClick={() => openSettings("accounts")}>Accounts</button>.</p>
	</SettingsPageLayout>;
}
