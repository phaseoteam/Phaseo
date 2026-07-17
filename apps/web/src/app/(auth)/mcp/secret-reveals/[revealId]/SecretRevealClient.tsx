"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Eye } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SecretRevealClient({ revealId, available }: { revealId: string; available: boolean }) {
	const [secrets, setSecrets] = useState<Record<string, string> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function reveal() {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(`/api/internal/mcp/secret-reveals/${encodeURIComponent(revealId)}`, {
				method: "POST",
				headers: { "X-Phaseo-MCP-Reveal": "1" },
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body?.error ?? "Secret reveal failed");
			setSecrets(body.secrets ?? {});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Secret reveal failed");
		} finally {
			setLoading(false);
		}
	}

	if (secrets) {
		return (
			<div className="space-y-4">
				<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>These values will not be shown again. Store them in your secret manager now and do not paste them into an AI conversation.</AlertDescription></Alert>
				{Object.entries(secrets).map(([name, value]) => (
					<div key={name} className="space-y-2 rounded-md border p-4">
						<div className="font-mono text-xs text-muted-foreground break-all">{name}</div>
						<code className="block rounded bg-muted p-3 text-sm break-all select-all">{value}</code>
						<Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(value)}><Copy className="mr-2 h-4 w-4" />Copy</Button>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
			<Button type="button" variant="destructive" className="w-full" disabled={!available || loading} onClick={reveal}><Eye className="mr-2 h-4 w-4" />{loading ? "Revealing..." : "Reveal secret once"}</Button>
		</div>
	);
}
