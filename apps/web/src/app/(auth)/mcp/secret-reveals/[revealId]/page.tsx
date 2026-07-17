import { AlertTriangle, KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SecretRevealClient } from "./SecretRevealClient";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";
import { createClient } from "@/utils/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Reveal MCP secret - Phaseo" };

type SecretRevealPageProps = { params: Promise<{ revealId: string }> };

export default function McpSecretRevealPage(props: SecretRevealPageProps) {
	return (
		<Suspense fallback={<div className="container max-w-2xl mx-auto py-12"><Card><CardContent className="p-8 text-center text-muted-foreground">Loading secret reveal...</CardContent></Card></div>}>
			<McpSecretRevealContent {...props} />
		</Suspense>
	);
}

async function McpSecretRevealContent({ params }: SecretRevealPageProps) {
	const { revealId } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(revealId)) redirect("/");
	const supabase = await createClient();
	const [{ data: { user } }, { data: { session } }] = await Promise.all([
		supabase.auth.getUser(),
		supabase.auth.getSession(),
	]);
	if (!user || !session?.access_token) redirect(`/sign-in?returnUrl=${encodeURIComponent(`/mcp/secret-reveals/${revealId}`)}`);
	const url = new URL(`${apiBaseUrl()}/oauth/mcp/secret-reveal`);
	url.searchParams.set("reveal_id", revealId);
	const response = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
	const body = await response.json().catch(() => null);
	const reveal = body?.reveal;
	if (!response.ok || !reveal) {
		return <div className="container max-w-2xl mx-auto py-12"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>This secret reveal is unavailable or does not belong to your account.</AlertDescription></Alert></div>;
	}
	const available = !reveal.revealed_at && Date.parse(reveal.expires_at) > Date.now();
	return (
		<div className="container max-w-2xl mx-auto py-12">
			<Card>
				<CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />One-time MCP secret reveal</CardTitle></CardHeader>
				<CardContent className="space-y-5">
					<p className="text-sm text-muted-foreground">This secret was encrypted before storage and was never returned to the model. It can be viewed once by the Phaseo user who approved the action.</p>
					<div className="rounded-md border bg-muted/30 p-3 text-xs"><div>Tool: <code>{reveal.tool_name}</code></div><div>Workspace: <code>{reveal.workspace_id}</code></div><div>Expires: {new Date(reveal.expires_at).toLocaleString()}</div></div>
					{!available && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>This secret has already been viewed or has expired.</AlertDescription></Alert>}
					<SecretRevealClient revealId={revealId} available={available} />
				</CardContent>
			</Card>
		</div>
	);
}
