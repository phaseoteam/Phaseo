"use client";

import { useState } from "react";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import { Copy, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { toast } from "sonner";
import { reauthorizeCliScopesAction } from "@/app/(dashboard)/settings/authorized-apps/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { oauthScopeLabel } from "@/lib/oauth/scopes";

interface ReauthorizeDialogProps {
	authorizationId: string;
	appName: string;
	homepageUrl?: string | null;
	currentScopes: string[];
	additionalScopes: string[];
}

export default function ReauthorizeDialog({ authorizationId, appName, homepageUrl, currentScopes, additionalScopes }: ReauthorizeDialogProps) {
	const isPhaseoCli = appName === "Phaseo CLI";
	const [open, setOpen] = useState(false);
	const [selectedAdditionalScopes, setSelectedAdditionalScopes] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const router = useRouter();

	const copyCliCommand = async () => {
		await navigator.clipboard.writeText("phaseo login");
		toast.success("Copied phaseo login");
	};
	const toggleAdditionalScope = (scope: string, checked: boolean) => {
		setSelectedAdditionalScopes((current) => checked ? Array.from(new Set([...current, scope])) : current.filter((value) => value !== scope));
	};
	const reauthorizeOnWeb = async () => {
		setSaving(true);
		const result = await reauthorizeCliScopesAction(authorizationId, Array.from(new Set([...currentScopes, ...selectedAdditionalScopes])));
		setSaving(false);
		if (result.error) {
			toast.error(result.error);
			return;
		}
		toast.success("CLI permissions restored");
		setOpen(false);
		setSelectedAdditionalScopes([]);
		router.refresh();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="min-w-0 flex-1 rounded-md sm:flex-none">
					<RefreshCw className="size-4" /> Reauthorize
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reauthorize {appName}</DialogTitle>
					<DialogDescription>
						{isPhaseoCli ? "Restore removed permissions on the web, or start a genuinely fresh session from the CLI." : "OAuth must be restarted by the application so it can create a fresh, secure PKCE request."}
					</DialogDescription>
				</DialogHeader>

				{isPhaseoCli ? (
					<div className="space-y-3">
						<div className="rounded-md border bg-muted/30 p-3">
							<div className="text-sm font-medium">CLI permissions</div>
							{additionalScopes.length > 0 ? (
								<>
									<p className="mt-1 text-xs text-muted-foreground">Select permissions you previously removed. Restored access applies when the CLI next refreshes its session.</p>
									<div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
										{additionalScopes.map((scope) => (
											<label key={scope} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
												<Checkbox checked={selectedAdditionalScopes.includes(scope)} onCheckedChange={(checked) => toggleAdditionalScope(scope, checked === true)} />
												<span className="text-xs">{oauthScopeLabel(scope)}</span>
											</label>
										))}
									</div>
									<Button type="button" className="mt-3 w-full rounded-md" disabled={saving || selectedAdditionalScopes.length === 0} onClick={reauthorizeOnWeb}>
										<RefreshCw className="size-4" />
										{saving ? "Restoring..." : "Restore selected permissions"}
									</Button>
								</>
							) : (
								<div className="mt-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
									All available CLI permissions are currently authorized.
								</div>
							)}
						</div>
						<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
							<div className="flex min-w-0 items-center gap-2"><Terminal className="size-4 shrink-0 text-muted-foreground" /><code className="truncate text-sm">phaseo login</code></div>
							<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={copyCliCommand}><Copy className="size-3.5" /> Copy</Button>
						</div>
					</div>
				) : homepageUrl ? (
					<p className="text-sm text-muted-foreground">Open the application and sign in with Phaseo again to review its requested permissions.</p>
				) : (
					<p className="text-sm text-muted-foreground">Open this application where you originally connected it, then choose its Phaseo sign-in or reconnect option.</p>
				)}

				{!isPhaseoCli && homepageUrl ? (
					<DialogFooter><Button asChild className="rounded-md"><a href={homepageUrl} target="_blank" rel="noopener noreferrer">Open application <ExternalLink className="size-4" /></a></Button></DialogFooter>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
