import { useWorkspace } from "../app/workspace";
import { BrandMark } from "../shell/BrandMark";
import { PhaseoSignInForm } from "../components/PhaseoSignInForm";

export function SignInCard({ onOpenSettings }: { onOpenSettings: () => void }) {
	const { setOverview } = useWorkspace();
	return <div className="w-full max-w-sm text-center">
		<BrandMark className="mx-auto size-10 rounded-md" />
		<h2 className="mt-4 text-lg font-bold">Sign in to Phaseo</h2>
		<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Chat with hundreds of models from every major lab, billed to your Phaseo credits. Use the account you have on phaseo.app.</p>
		<div className="mt-5"><PhaseoSignInForm onConnected={workspace => setOverview(workspace)} /></div>
		<p className="mt-5 text-xs text-muted-foreground">Prefer Codex, Claude Code or an API key? <button type="button" className="font-semibold text-primary hover:underline" onClick={onOpenSettings}>Connect in Settings</button></p>
	</div>;
}
