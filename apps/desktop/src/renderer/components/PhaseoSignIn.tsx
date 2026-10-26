import { useState } from "react";
import { HarnessLogo } from "./HarnessLogo";
import { PhaseoSignInForm } from "./PhaseoSignInForm";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";

/** A button that opens the Phaseo sign-in form in its place, to add a Phaseo account. */
export function PhaseoSignIn({ onConnected, disabled = false }: { onConnected: (workspace: WorkspaceOverview, accountId: string) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	return <div className="phaseo-sign-in">
		{!open && <button type="button" disabled={disabled} onClick={() => setOpen(true)}><HarnessLogo harness="phaseo" />Sign in to Phaseo</button>}
		{open && <div className="w-full max-w-sm"><PhaseoSignInForm disabled={disabled} onCancel={() => setOpen(false)} onConnected={(workspace, id) => { setOpen(false); onConnected(workspace, id); }} /></div>}
	</div>;
}
