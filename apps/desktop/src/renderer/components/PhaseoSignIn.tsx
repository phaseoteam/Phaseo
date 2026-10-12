import { useRef, useState } from "react";
import { HarnessLogo } from "./HarnessLogo";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";

export function PhaseoSignIn({ onConnected, accountId, disabled = false }: { onConnected: (workspace: WorkspaceOverview, accountId: string) => void; accountId?: string; disabled?: boolean }) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const busy = useRef(false);
	async function signIn() {
		const api = window.phaseoDesktop?.workspace;
		if (!api || busy.current || disabled) return;
		busy.current = true; setPending(true); setError("");
		try { const result = await api.signInPhaseo(accountId); onConnected(result.workspace, result.accountId); }
		catch (reason) { const message = (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); if (message !== "Sign-in canceled.") setError(message); }
		finally { busy.current = false; setPending(false); }
	}
	return <div className="phaseo-sign-in"><button type="button" disabled={disabled || pending} onClick={() => void signIn()}><HarnessLogo harness="phaseo" />{pending ? "Waiting for browser…" : accountId ? "Sign in again" : "Sign in to Phaseo"}</button>{pending && <button type="button" onClick={() => { void window.phaseoDesktop?.workspace.cancelPhaseoSignIn(); }}>Cancel</button>}{error && <small role="alert">{error}</small>}</div>;
}
