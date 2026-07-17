"use server";

import { redirect } from "next/navigation";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";
import { createClient } from "@/utils/supabase/server";

export async function approveMcpAction(approvalId: string): Promise<void> {
	if (!/^[0-9a-f-]{36}$/i.test(approvalId)) throw new Error("Invalid approval identifier");
	const supabase = await createClient();
	const [{ data: { user } }, { data: { session } }] = await Promise.all([
		supabase.auth.getUser(),
		supabase.auth.getSession(),
	]);
	if (!user || !session?.access_token) {
		redirect(`/sign-in?returnUrl=${encodeURIComponent(`/mcp/approvals/${approvalId}`)}`);
	}
	const response = await fetch(`${apiBaseUrl()}/oauth/mcp/action-approval/approve`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ approval_id: approvalId }),
		cache: "no-store",
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		const message = typeof body?.error_description === "string"
			? body.error_description
			: "The action could not be approved.";
		redirect(`/mcp/approvals/${approvalId}?error=${encodeURIComponent(message)}`);
	}
	redirect(`/mcp/approvals/${approvalId}?approved=1`);
}
