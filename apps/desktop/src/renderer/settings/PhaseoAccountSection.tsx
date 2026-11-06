import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { PhaseoSignInForm } from "../components/PhaseoSignInForm";
import { HarnessLogo } from "../components/HarnessLogo";
import { Button } from "../components/ui/button";

export function PhaseoAccountSection({ workspace, accountId, onConnected, onCancel }: { workspace: WorkspaceOverview; accountId?: string; onConnected: (workspace: WorkspaceOverview) => void; onCancel: () => void }) {
	const accounts = workspace.accounts.filter(account => account.harness === "phaseo" && account.oauthExpiresAt && !account.archived);
	const [adding, setAdding] = useState(false);
	const section = useRef<HTMLElement>(null);
	const showForm = !accounts.length || adding || !!accountId;
	useEffect(() => { if (accountId) section.current?.scrollIntoView({ block: "start" }); }, [accountId]);
	const close = () => { setAdding(false); onCancel(); };
	return <section ref={section} aria-label="Phaseo account" className="flex flex-col gap-5">
		<div>
			<h2 className="flex items-center gap-2 text-sm font-semibold"><HarnessLogo harness="phaseo" />Phaseo account</h2>
			<p className="mt-1.5 text-xs text-muted-foreground">Sign in with your Phaseo account to use your credits.</p>
		</div>
		{showForm ? <div className="w-full max-w-sm">
			<PhaseoSignInForm key={accountId ?? "new"} accountId={accountId} onCancel={accounts.length ? close : undefined} onConnected={next => { onConnected(next); close(); }} />
		</div> : <div className="flex flex-wrap items-center gap-3">
			<Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus />Add another account</Button>
		</div>}
	</section>;
}
