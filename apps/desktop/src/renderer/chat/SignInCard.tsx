import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { errorText, useWorkspace } from "../app/workspace";
import { BrandMark } from "../shell/BrandMark";
import { Button } from "../components/ui/button";

export function useSignIn() {
	const { api, setOverview } = useWorkspace();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const busy = useRef(false);
	async function signIn(accountId?: string) {
		if (!api || busy.current) return;
		busy.current = true; setPending(true); setError("");
		try { const result = await api.signInPhaseo(accountId); setOverview(result.workspace); return result.accountId; }
		catch (reason) { const message = errorText(reason); if (message !== "Sign-in canceled.") setError(message); }
		finally { busy.current = false; setPending(false); }
	}
	return { signIn, cancel: () => void api?.cancelPhaseoSignIn(), pending, error };
}

export function SignInCard({ onOpenSettings }: { onOpenSettings: () => void }) {
	const { signIn, cancel, pending, error } = useSignIn();
	return <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
		<BrandMark className="mx-auto size-10 rounded-xl" />
		<h2 className="mt-4 text-lg font-bold">Sign in to Phaseo</h2>
		<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Chat with hundreds of models from every major lab, billed to your Phaseo credits. Your browser opens to finish signing in.</p>
		<div className="mt-5 flex flex-col items-center gap-2">
			<Button size="lg" className="w-full" disabled={pending} onClick={() => void signIn()}>{pending ? <><LoaderCircle className="animate-spin" />Waiting for your browser…</> : "Sign in with your browser"}</Button>
			{pending && <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		</div>
		<p className="mt-5 text-xs text-muted-foreground">Prefer Codex, Claude Code or an API key? <button type="button" className="font-semibold text-primary hover:underline" onClick={onOpenSettings}>Connect in Settings</button></p>
	</div>;
}
