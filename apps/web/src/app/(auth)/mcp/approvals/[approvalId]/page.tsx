import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { approveMcpAction } from "./actions";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";
import { createClient } from "@/utils/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
	title: "Approve MCP action - Phaseo",
	description: "Review and approve one exact Phaseo MCP control-plane action.",
};

type Approval = {
	id: string;
	workspace_id: string;
	oauth_client_id: string;
	tool_name: string;
	action_title: string;
	action_method: string;
	action_path: string;
	action_payload: Record<string, unknown>;
	required_scopes: string[];
	approved_at: string | null;
	consumed_at: string | null;
	completed_at: string | null;
	outcome: "succeeded" | "failed" | null;
	expires_at: string;
};

type ApprovalPageProps = {
	params: Promise<{ approvalId: string }>;
	searchParams: Promise<{ approved?: string; error?: string }>;
};

export default function McpActionApprovalPage(props: ApprovalPageProps) {
	return (
		<Suspense fallback={<div className="container max-w-3xl mx-auto py-12"><Card><CardContent className="p-8 text-center text-muted-foreground">Loading action approval...</CardContent></Card></div>}>
			<McpActionApprovalContent {...props} />
		</Suspense>
	);
}

async function McpActionApprovalContent({
	params,
	searchParams,
}: ApprovalPageProps) {
	const { approvalId } = await params;
	const query = await searchParams;
	if (!/^[0-9a-f-]{36}$/i.test(approvalId)) redirect("/");
	const supabase = await createClient();
	const [{ data: { user } }, { data: { session } }] = await Promise.all([
		supabase.auth.getUser(),
		supabase.auth.getSession(),
	]);
	if (!user || !session?.access_token) {
		redirect(`/sign-in?returnUrl=${encodeURIComponent(`/mcp/approvals/${approvalId}`)}`);
	}
	const url = new URL(`${apiBaseUrl()}/oauth/mcp/action-approval`);
	url.searchParams.set("approval_id", approvalId);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${session.access_token}` },
		cache: "no-store",
	});
	const body = await response.json().catch(() => null);
	const approval = body?.approval as Approval | undefined;
	if (!response.ok || !approval) {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>This approval is unavailable or does not belong to your account.</AlertDescription></Alert>
			</div>
		);
	}
	const expired = Date.parse(approval.expires_at) <= Date.now();
	const pending = !expired && !approval.approved_at && !approval.consumed_at;
	const action = approveMcpAction.bind(null, approvalId);

	return (
		<div className="container max-w-3xl mx-auto py-12">
			<Card>
				<CardHeader className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<CardTitle>Approve an MCP action</CardTitle>
						<Badge variant={approval.outcome === "failed" ? "destructive" : "outline"}>
							{approval.outcome ?? (approval.consumed_at ? "Executing" : approval.approved_at ? "Approved" : expired ? "Expired" : "Pending")}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">This approval is bound to one user, workspace, OAuth client, tool, target path, and exact payload. It expires after ten minutes and can be consumed once.</p>
				</CardHeader>
				<CardContent className="space-y-5">
					{query.approved === "1" && <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>Approved. Return to your MCP client so it can complete this exact action.</AlertDescription></Alert>}
					{query.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{query.error}</AlertDescription></Alert>}
					<Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertDescription>Approve only if you initiated this request and recognize every target and value below.</AlertDescription></Alert>
					<div className="grid gap-3 sm:grid-cols-2 text-sm">
						<div><div className="text-muted-foreground">Action</div><div className="font-medium">{approval.action_title}</div></div>
						<div><div className="text-muted-foreground">Tool</div><code>{approval.tool_name}</code></div>
						<div><div className="text-muted-foreground">Workspace</div><code className="break-all">{approval.workspace_id}</code></div>
						<div><div className="text-muted-foreground">OAuth client</div><code className="break-all">{approval.oauth_client_id}</code></div>
						<div className="sm:col-span-2"><div className="text-muted-foreground">Target</div><code className="break-all">{approval.action_method} {approval.action_path}</code></div>
					</div>
					<div>
						<div className="text-sm text-muted-foreground mb-2">Exact request payload</div>
						<pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-4 text-xs whitespace-pre-wrap break-all">{JSON.stringify(approval.action_payload, null, 2)}</pre>
					</div>
					<div><div className="text-sm text-muted-foreground mb-2">Required scopes</div><div className="flex flex-wrap gap-2">{approval.required_scopes.map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}</div></div>
				</CardContent>
				<CardFooter>
					{pending ? <form action={action} className="w-full"><Button type="submit" variant="destructive" className="w-full">Approve this exact action once</Button></form> : <p className="w-full text-center text-sm text-muted-foreground">This approval can no longer be changed.</p>}
				</CardFooter>
			</Card>
		</div>
	);
}
