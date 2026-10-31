import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { PhaseoSignInMethod, PhaseoSignInResult } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";

const providers = [["github", "GitHub"], ["google", "Google"], ["gitlab", "GitLab"]] as const;
type Step = "choose" | "browser" | "password" | "code" | "verifying";

function message(reason: unknown) {
	return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

/**
 * Signing in to Phaseo with the account you use on the website: GitHub, Google or GitLab in the browser, or an email
 * and password here, then the authenticator code when the account has two-factor sign-in. Nothing secret stays in
 * the window: the main process keeps the login.
 */
export function PhaseoSignInForm({ accountId, onConnected, onCancel, disabled = false }: {
	accountId?: string; onConnected: (workspace: WorkspaceOverview, accountId: string) => void; onCancel?: () => void; disabled?: boolean;
}) {
	const [step, setStep] = useState<Step>("choose");
	const [error, setError] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const busy = useRef(false);
	const api = window.phaseoDesktop?.workspace;
	async function run(pending: Step, action: () => Promise<PhaseoSignInResult>, back: Step) {
		if (!api || busy.current || disabled) return;
		busy.current = true; setStep(pending); setError("");
		try {
			const result = await action();
			if ("secondFactor" in result) { setPassword(""); setCode(""); setStep("code"); return; }
			setPassword(""); setStep("choose"); onConnected(result.workspace, result.accountId);
		} catch (reason) {
			const text = message(reason);
			if (text !== "Sign-in canceled.") setError(text);
			setStep(back);
		} finally { busy.current = false; }
	}
	const signIn = (method: PhaseoSignInMethod) => run("provider" in method ? "browser" : "password", () => api!.signInPhaseo(accountId, method), "choose");
	const cancel = () => { void api?.cancelPhaseoSignIn(); setStep("choose"); setCode(""); setError(""); onCancel?.(); };
	const link = (url: string) => void window.phaseoDesktop?.openExternal(url);

	if (step === "code" || step === "verifying") return <form className="flex flex-col gap-3 text-left" aria-label="Two-factor sign-in" onSubmit={event => { event.preventDefault(); void run("verifying", () => api!.verifyPhaseoSignIn(code), "code"); }}>
		<div>
			<p className="text-sm font-semibold">Two-factor sign-in</p>
			<p className="mt-0.5 text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
		</div>
		<div className="flex gap-2">
			<Input autoFocus inputMode="numeric" autoComplete="one-time-code" aria-label="Authenticator code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="font-mono tracking-widest" />
			<Button type="submit" disabled={code.length !== 6 || step === "verifying"}>{step === "verifying" ? <><LoaderCircle className="animate-spin" />Checking…</> : "Verify"}</Button>
		</div>
		{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		<Button type="button" variant="ghost" size="sm" className="self-start" onClick={cancel}>Cancel</Button>
	</form>;

	const waiting = step === "browser" || step === "password";
	return <div className="flex flex-col gap-3 text-left">
		<div className="flex flex-col gap-2">
			{providers.map(([provider, label]) => <Button key={provider} type="button" variant="outline" disabled={disabled || waiting} onClick={() => void signIn({ provider })}>Continue with {label}</Button>)}
		</div>
		{step === "browser" && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1.5"><LoaderCircle className="size-3.5 animate-spin" />Finish signing in in your browser…</span>
			<Button type="button" variant="ghost" size="xs" onClick={cancel}>Cancel</Button>
		</div>}
		<div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
		<form className="flex flex-col gap-2" aria-label="Sign in with email" onSubmit={event => { event.preventDefault(); void signIn({ email, password }); }}>
			<Input type="email" autoComplete="username" placeholder="Email" aria-label="Email" required value={email} onChange={event => setEmail(event.target.value)} disabled={disabled || waiting} />
			<Input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" required value={password} onChange={event => setPassword(event.target.value)} disabled={disabled || waiting} />
			<Button type="submit" disabled={disabled || waiting || !email.trim() || !password}>{step === "password" ? <><LoaderCircle className="animate-spin" />Signing in…</> : "Sign in"}</Button>
		</form>
		{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		<p className="text-xs text-muted-foreground">
			<button type="button" className="hover:text-foreground hover:underline" onClick={() => link("https://phaseo.app/sign-in")}>Forgot your password?</button>
			{" · "}
			<button type="button" className="hover:text-foreground hover:underline" onClick={() => link("https://phaseo.app/sign-up")}>Create an account</button>
			{onCancel && <>{" · "}<button type="button" className="hover:text-foreground hover:underline" onClick={cancel}>Cancel</button></>}
		</p>
	</div>;
}
