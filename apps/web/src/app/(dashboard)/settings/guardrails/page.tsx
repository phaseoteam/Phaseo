import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
	title: "Guardrails",
};

export default function GuardrailsSettingsPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Guardrails</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Configure request validation and safety limits for your team.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Coming Soon</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					This section will centralize gateway policies like max cost caps, model
					allow/deny lists, tool restrictions, and content controls.
				</CardContent>
			</Card>
		</div>
	);
}

