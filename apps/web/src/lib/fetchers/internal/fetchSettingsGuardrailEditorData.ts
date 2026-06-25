import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsGuardrailEditorData } from "@/app/api/internal/settings/guardrails/editor/route";

export async function fetchSettingsGuardrailEditorData(
	mode: "create" | "edit",
	guardrailId?: string | null,
): Promise<SettingsGuardrailEditorData> {
	const requestHeaders = await headers();
	const params = new URLSearchParams({ mode });
	const normalizedGuardrailId = String(guardrailId ?? "").trim();
	if (normalizedGuardrailId) {
		params.set("guardrailId", normalizedGuardrailId);
	}

	const response = await fetch(
		absoluteUrl(`/api/internal/settings/guardrails/editor?${params.toString()}`),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch guardrail editor data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsGuardrailEditorData;
}
