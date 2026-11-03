"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";

async function callDeviceActivation(body: Record<string, unknown>) {
	const supabase = await createClient();
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session?.access_token) {
		throw new Error("Unauthorized");
	}
	if (body.action === "approve") {
		const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
		if (error || !assurance || (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) {
			throw new Error("Complete two-factor verification before approving this device");
		}
	}

	const response = await fetch(`${apiBaseUrl()}/oauth/device/activate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.access_token}`,
		},
		body: JSON.stringify(body),
		cache: "no-store",
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(String(payload?.error_description ?? payload?.message ?? "Activation failed"));
	}
	return payload;
}

// The code comes only from what the person typed into the form, never from the link they opened,
// so a link someone else sends can't pre-approve their device.
function typedUserCode(formData: FormData) {
	return String(formData.get("user_code") ?? "").trim().slice(0, 64);
}

export async function approveDeviceAction(formData: FormData) {
	const userCode = typedUserCode(formData);
	const workspaceId = String(formData.get("workspace_id") ?? "");
	if (!userCode) redirect("/activate?error=1");
	let approved = false;
	try {
		await callDeviceActivation({
			action: "approve",
			user_code: userCode,
			workspace_id: workspaceId,
		});
		approved = true;
	} catch {
		approved = false;
	}
	redirect(approved ? "/activate?approved=1" : "/activate?error=1");
}

export async function denyDeviceAction(formData: FormData) {
	const userCode = typedUserCode(formData);
	if (!userCode) redirect("/activate?error=1");
	let denied = false;
	try {
		await callDeviceActivation({
			action: "deny",
			user_code: userCode,
		});
		denied = true;
	} catch {
		denied = false;
	}
	redirect(denied ? "/activate?denied=1" : "/activate?error=1");
}
