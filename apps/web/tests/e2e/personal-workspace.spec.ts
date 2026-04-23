import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

function loadEnvFile(filePath: string) {
	if (!fs.existsSync(filePath)) return;
	const contents = fs.readFileSync(filePath, "utf8");
	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separatorIndex = line.indexOf("=");
		if (separatorIndex <= 0) continue;
		const key = line.slice(0, separatorIndex).trim();
		if (!key || process.env[key]) continue;
		let value = line.slice(separatorIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), "../../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

type SeededUser = {
	userId: string;
	email: string;
	password: string;
};

async function createAuthOnlyUser() {
	const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const email = `playwright-personal-${suffix}@example.com`;
	const password = `Pw-${suffix}-A9!`;
	const result = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { full_name: "Playwright Personal" },
	});
	if (result.error || !result.data.user?.id) {
		throw result.error ?? new Error("Failed to create auth test user");
	}
	return {
		userId: result.data.user.id,
		email,
		password,
	};
}

async function createProvisionedUser(options?: { paidAccess?: boolean }) {
	const seeded = await createAuthOnlyUser();
	const provisionResult = await admin.rpc("provision_personal_workspace", {
		p_user_id: seeded.userId,
		p_display_name: "Playwright Provisioned",
	});
	if (provisionResult.error) {
		throw provisionResult.error;
	}

	const provisionRow = Array.isArray(provisionResult.data)
		? (provisionResult.data[0] ?? null)
		: provisionResult.data;
	const workspaceId = String((provisionRow as any)?.workspace_id ?? "").trim();
	if (!workspaceId) {
		throw new Error("Failed to provision personal workspace");
	}

	const balanceNanos = options?.paidAccess ? 50_000_000_000 : 0;
	const walletResult = await admin.from("wallets").upsert(
		{
			workspace_id: workspaceId,
			stripe_customer_id: `cus_playwright_${Date.now()}`,
			balance_nanos: balanceNanos,
			reserved_nanos: 0,
		},
		{ onConflict: "workspace_id", ignoreDuplicates: false },
	);
	if (walletResult.error) {
		throw walletResult.error;
	}

	if (options?.paidAccess) {
		const ledgerResult = await admin.from("credit_ledger").insert({
			workspace_id: workspaceId,
			kind: "top_up",
			amount_nanos: balanceNanos,
			before_balance_nanos: 0,
			after_balance_nanos: balanceNanos,
			ref_type: "playwright",
			ref_id: `seed-top-up-${Date.now()}`,
			status: "succeeded",
		});
		if (ledgerResult.error) {
			throw ledgerResult.error;
		}
	}

	return { ...seeded, workspaceId };
}

async function fetchWorkspaceState(userId: string) {
	const userRow = await admin
		.from("users")
		.select("default_workspace_id")
		.eq("user_id", userId)
		.maybeSingle();
	if (userRow.error) throw userRow.error;
	const workspaceId = String(userRow.data?.default_workspace_id ?? "");
	if (!workspaceId) {
		return null;
	}

	const [workspaceRow, memberRow, settingsRow, walletRow] = await Promise.all([
		admin
			.from("workspaces")
			.select("id,name,owner_user_id")
			.eq("id", workspaceId)
			.maybeSingle(),
		admin
			.from("workspace_members")
			.select("workspace_id,role")
			.eq("workspace_id", workspaceId)
			.eq("user_id", userId)
			.maybeSingle(),
		admin
			.from("workspace_settings")
			.select("workspace_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
		admin
			.from("wallets")
			.select("workspace_id,stripe_customer_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
	]);

	if (workspaceRow.error) throw workspaceRow.error;
	if (memberRow.error) throw memberRow.error;
	if (settingsRow.error) throw settingsRow.error;
	if (walletRow.error) throw walletRow.error;

	return {
		workspaceId,
		workspace: workspaceRow.data,
		member: memberRow.data,
		settings: settingsRow.data,
		wallet: walletRow.data,
	};
}

async function fetchOwnedWorkspaceByName(userId: string, name: string) {
	const result = await admin
		.from("workspaces")
		.select("id,name,owner_user_id")
		.eq("owner_user_id", userId)
		.eq("name", name)
		.maybeSingle();
	if (result.error) throw result.error;
	return result.data;
}

async function fetchWorkspaceMembership(workspaceId: string, userId: string) {
	const result = await admin
		.from("workspace_members")
		.select("workspace_id,role")
		.eq("workspace_id", workspaceId)
		.eq("user_id", userId)
		.maybeSingle();
	if (result.error) throw result.error;
	return result.data;
}

async function fetchWorkspaceWallet(workspaceId: string) {
	const result = await admin
		.from("wallets")
		.select("workspace_id,stripe_customer_id")
		.eq("workspace_id", workspaceId)
		.maybeSingle();
	if (result.error) throw result.error;
	return result.data;
}

async function fetchKeyByKid(kid: string) {
	const result = await admin
		.from("keys")
		.select("id,workspace_id,name,created_by,status,kid")
		.eq("kid", kid)
		.maybeSingle();
	if (result.error) throw result.error;
	return result.data;
}

async function cleanupUserGraph(userId: string) {
	const { data: ownedWorkspaces } = await admin
		.from("workspaces")
		.select("id")
		.eq("owner_user_id", userId);
	const workspaceIds = Array.from(
		new Set(
			(ownedWorkspaces ?? [])
				.map((row) => String(row?.id ?? "").trim())
				.filter(Boolean),
		),
	);

	if (workspaceIds.length) {
		const { data: keys } = await admin
			.from("keys")
			.select("id")
			.in("workspace_id", workspaceIds);
		const keyIds = Array.from(
			new Set(
				(keys ?? [])
					.map((row) => String(row?.id ?? "").trim())
					.filter(Boolean),
			),
		);

		if (keyIds.length) {
			await admin.from("key_guardrails").delete().in("key_id", keyIds);
			await admin.from("broadcast_destination_keys").delete().in("key_id", keyIds);
		}

		await admin.from("keys").delete().in("workspace_id", workspaceIds);
		await admin.from("credit_ledger").delete().in("workspace_id", workspaceIds);
		await admin.from("workspace_join_requests").delete().in("workspace_id", workspaceIds);
		await admin.from("workspace_invites").delete().in("workspace_id", workspaceIds);
		await admin.from("workspace_members").delete().in("workspace_id", workspaceIds);
		await admin.from("workspace_settings").delete().in("workspace_id", workspaceIds);
		await admin.from("wallets").delete().in("workspace_id", workspaceIds);
		await admin
			.from("users")
			.update({ default_workspace_id: null })
			.eq("user_id", userId);
		await admin.from("workspaces").delete().in("id", workspaceIds);
	}

	await admin.from("users").delete().eq("user_id", userId);
	await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}

async function signInThroughUi(page: Page, seeded: SeededUser, returnUrl: string) {
	await page.goto(`/sign-in?returnUrl=${encodeURIComponent(returnUrl)}`);
	await page.getByLabel("Email").fill(seeded.email);
	await page.getByLabel("Password").fill(seeded.password);
	await page.getByRole("button", { name: "Sign in with email" }).click();
	await page.waitForURL(`**${returnUrl}`, { timeout: 30000 });
}

async function createWorkspaceViaUi(page: Page, name: string) {
	await page.getByRole("button", { name: "Create Workspace" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Create Workspace")).toBeVisible();
	await dialog.getByPlaceholder("Workspace Name").fill(name);
	await dialog.getByRole("button", { name: /^Create$/ }).click();
	await expect(dialog).not.toBeVisible({ timeout: 30000 });
}

async function switchWorkspaceViaHeader(
	page: Page,
	workspaceName: string,
	workspaceId?: string,
) {
	await page.getByRole("button", { name: "Open workspace switcher" }).click();
	await page.getByRole("menuitem", { name: workspaceName }).click();
	if (workspaceId) {
		await expect
			.poll(
				async () =>
					page
						.context()
						.cookies()
						.then(
							(cookies) =>
								cookies.find((cookie) => cookie.name === "activeWorkspaceId")
									?.value ?? null,
						),
				{ timeout: 10000 },
			)
			.toBe(workspaceId);
	}
	await page.reload();
	await expect(page.getByRole("banner")).toContainText(workspaceName);
}

test.describe("personal workspace provisioning", () => {
	test.describe.configure({ mode: "serial" });

	test("creates the personal workspace and related rows on first sign-in", async ({
		page,
	}) => {
		if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error("Supabase env is required for personal workspace e2e");
		}

		const seeded = await createAuthOnlyUser();

		try {
			await page.goto("/sign-in?returnUrl=%2Fsettings%2Fworkspaces");
			await page.getByLabel("Email").fill(seeded.email);
			await page.getByLabel("Password").fill(seeded.password);
			await page.getByRole("button", { name: "Sign in with email" }).click();

			await page.waitForURL("**/settings/workspaces", { timeout: 30000 });

			await expect
				.poll(async () => (await fetchWorkspaceState(seeded.userId))?.workspaceId ?? null, {
					timeout: 30000,
				})
				.not.toBeNull();

			const resolvedState = await fetchWorkspaceState(seeded.userId);
			if (!resolvedState) {
				throw new Error("Workspace state was not provisioned");
			}

			await expect(
				page.getByRole("button", { name: "Open workspace switcher" }),
			).toContainText("Personal");

			expect(resolvedState.workspace?.owner_user_id).toBe(seeded.userId);
			expect(resolvedState.workspace?.name).toBe("Personal");
			expect(resolvedState.member?.role).toBe("owner");
			expect(resolvedState.settings?.workspace_id).toBe(resolvedState.workspaceId);
			expect(resolvedState.wallet?.workspace_id).toBe(resolvedState.workspaceId);
			expect(String(resolvedState.wallet?.stripe_customer_id ?? "")).toMatch(
				/^cus_/,
			);

		} finally {
			await cleanupUserGraph(seeded.userId);
		}
	});

	test("creates an additional workspace after paid access is unlocked", async ({
		page,
	}) => {
		const seeded = await createProvisionedUser({ paidAccess: true });
		const workspaceName = `Workspace ${Date.now()}`;

		try {
			await signInThroughUi(page, seeded, "/settings/workspaces/general");
			await createWorkspaceViaUi(page, workspaceName);

			await expect
				.poll(
					async () =>
						(await fetchOwnedWorkspaceByName(seeded.userId, workspaceName))?.id ??
						null,
					{
					timeout: 30000,
					},
				)
				.not.toBeNull();

			const workspaceRow = await fetchOwnedWorkspaceByName(
				seeded.userId,
				workspaceName,
			);
			if (!workspaceRow?.id) {
				throw new Error("Workspace row was not created");
			}

			await expect
				.poll(async () => (await fetchWorkspaceWallet(workspaceRow.id))?.workspace_id ?? null, {
					timeout: 30000,
				})
				.toBe(workspaceRow.id);

			const [membership, wallet] = await Promise.all([
				fetchWorkspaceMembership(workspaceRow.id, seeded.userId),
				fetchWorkspaceWallet(workspaceRow.id),
			]);

			expect(workspaceRow.owner_user_id).toBe(seeded.userId);
			expect(membership?.role).toBe("owner");
			expect(wallet?.workspace_id).toBe(workspaceRow.id);

			await page.reload();
			await switchWorkspaceViaHeader(page, workspaceName, workspaceRow.id);
		} finally {
			await cleanupUserGraph(seeded.userId);
		}
	});

	test("creates an API key for the workspace selected in the header", async ({
		page,
	}) => {
		const seeded = await createProvisionedUser({ paidAccess: true });
		const workspaceName = `Key Workspace ${Date.now()}`;
		const keyName = `Playwright Key ${Date.now()}`;

		try {
			await signInThroughUi(page, seeded, "/settings/workspaces/general");
			await createWorkspaceViaUi(page, workspaceName);

			await expect
				.poll(
					async () =>
						(await fetchOwnedWorkspaceByName(seeded.userId, workspaceName))?.id ??
						null,
					{ timeout: 30000 },
				)
				.not.toBeNull();

			const createdWorkspace = await fetchOwnedWorkspaceByName(
				seeded.userId,
				workspaceName,
			);
			if (!createdWorkspace?.id) {
				throw new Error("Workspace row was not created");
			}

			await page.reload();
			await switchWorkspaceViaHeader(page, workspaceName, createdWorkspace.id);

			await page.goto("/settings/keys");
			await expect(page.getByRole("banner")).toContainText(workspaceName);

			await page.getByRole("button", { name: "Create Key" }).click();
			const dialog = page.getByRole("dialog");
			await expect(dialog.getByText("Create API Key")).toBeVisible();
			await expect(dialog.getByRole("button", { name: workspaceName })).toBeVisible();
			await dialog.getByPlaceholder("Key name (e.g. my app)").fill(keyName);
			await dialog.getByRole("button", { name: "Create Key" }).click();

			const plaintextLocator = dialog.getByText(/aistats_v1_sk_/);
			await expect(plaintextLocator).toBeVisible({ timeout: 15000 });
			const plaintext = (await plaintextLocator.textContent())?.trim() ?? "";
			expect(plaintext).toMatch(/^aistats_v1_sk_[A-Za-z0-9]+_/);

			const kid = plaintext.split("_")[3] ?? "";
			expect(kid.length).toBeGreaterThan(0);

			await expect
				.poll(async () => (await fetchKeyByKid(kid))?.id ?? null, {
					timeout: 30000,
				})
				.not.toBeNull();

			const storedKey = await fetchKeyByKid(kid);
			if (!storedKey?.workspace_id || !createdWorkspace?.id) {
				throw new Error("Key row or workspace row missing");
			}

			expect(storedKey.workspace_id).toBe(createdWorkspace.id);
			expect(storedKey.name).toBe(keyName);
			expect(storedKey.created_by).toBe(seeded.userId);
			expect(storedKey.status).toBe("active");
		} finally {
			await cleanupUserGraph(seeded.userId);
		}
	});
});
