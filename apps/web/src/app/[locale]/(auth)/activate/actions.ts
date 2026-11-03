"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";

// The code the person typed, kept server-side between "Continue" and "Approve". A link can't set
// this cookie, so a code someone else sends can never reach the approval step on its own.
const DEVICE_CODE_COOKIE = "phaseo_device_code";

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

function cleanUserCode(value: unknown) {
	return String(value ?? "").trim().slice(0, 64);
}

/** The code the person typed on this page, or "" when there is none. */
export async function reviewedDeviceCode() {
	return cleanUserCode((await cookies()).get(DEVICE_CODE_COOKIE)?.value);
}

/** Looks up the request behind a typed code so the person can see who asks and for what. */
export async function lookupDeviceRequest(userCode: string) {
	return callDeviceActivation({
		action: "lookup",
		user_code: userCode,
	});
}

// Step 1: the code comes only from what the person typed into the form, never from the link they opened.
export async function reviewDeviceAction(formData: FormData) {
	const userCode = cleanUserCode(formData.get("user_code"));
	if (!userCode) redirect("/activate?error=1");
	(await cookies()).set(DEVICE_CODE_COOKIE, userCode, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge: 600,
	});
	redirect("/activate");
}

export async function clearDeviceCodeAction() {
	(await cookies()).delete(DEVICE_CODE_COOKIE);
	redirect("/activate");
}

// Step 2: approve or deny the reviewed code. The form carries only the workspace choice.
export async function approveDeviceAction(formData: FormData) {
	const userCode = await reviewedDeviceCode();
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
	if (approved) (await cookies()).delete(DEVICE_CODE_COOKIE);
	redirect(approved ? "/activate?approved=1" : "/activate?error=1");
}

export async function denyDeviceAction() {
	const userCode = await reviewedDeviceCode();
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
	(await cookies()).delete(DEVICE_CODE_COOKIE);
	redirect(denied ? "/activate?denied=1" : "/activate?error=1");
}
