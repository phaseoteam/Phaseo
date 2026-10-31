import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverRedirectAction } from "@/lib/serverFn/actionMiddleware";
import { redirect } from "@/lib/navigation";
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

export const approveDeviceAction = createServerFn({ method: "POST" })
	.middleware([serverRedirectAction])
	.validator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const userCode = String(formData.get("user_code") ?? "");
		const workspaceId = String(formData.get("workspace_id") ?? "");
		await callDeviceActivation({
			action: "approve",
			user_code: userCode,
			workspace_id: workspaceId,
		});
		redirect("/activate?approved=1");
	});

export const denyDeviceAction = createServerFn({ method: "POST" })
	.middleware([serverRedirectAction])
	.validator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const userCode = String(formData.get("user_code") ?? "");
		await callDeviceActivation({
			action: "deny",
			user_code: userCode,
		});
		redirect("/activate?denied=1");
	});

export const lookupDeviceRequest = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((userCode: string) => userCode)
	.handler(async ({ data: userCode }) => {
		return callDeviceActivation({
			action: "lookup",
			user_code: userCode,
		});
	});
