import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { getSupabaseAdmin } from "@/runtime/env";
import { authenticateManagement } from "@/pipeline/before/auth";
import { json, withRuntime } from "@/routes/utils";

export const meRoutes = new Hono<Env>();

meRoutes.get(
	"/",
	withRuntime(async (req) => {
		const auth = await authenticateManagement(req, { useKvCache: false });
		if (!auth.ok || auth.authMethod !== "oauth" || !auth.userId || !auth.oauthClientId) {
			return json(
				{ error: "unauthorised", message: "Bearer OAuth token is invalid or expired" },
				401,
				{ "Cache-Control": "no-store" },
			);
		}

		const scopes = auth.oauthScopes ?? auth.scopes ?? [];
		if (!scopes.includes(CAPABILITIES.ME_READ)) {
			return json(
				{ error: "insufficient_scope", message: `Token requires ${CAPABILITIES.ME_READ}` },
				403,
				{ "Cache-Control": "no-store" },
			);
		}
		const supabase = getSupabaseAdmin();
		const [userResult, membershipsResult] = await Promise.all([
			supabase.auth.admin.getUserById(auth.userId),
			supabase
				.from("workspace_members")
				.select("role, workspace_id, workspaces:workspaces(id, name, slug)")
				.eq("user_id", auth.userId),
		]);

		const user = userResult.data?.user;
		const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
		const workspaces = (membershipsResult.data ?? []).map((row: any) => {
			const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
			return {
				id: workspace?.id ?? row.workspace_id,
				name: workspace?.name ?? null,
				slug: workspace?.slug ?? null,
				role: row.role ?? null,
				current: String(row.workspace_id) === auth.workspaceId,
			};
		});

		return json(
			{
				data: {
					user: {
						id: auth.userId,
						email: user?.email ?? null,
						name:
							typeof metadata.full_name === "string"
								? metadata.full_name
								: typeof metadata.name === "string"
									? metadata.name
									: null,
					},
					oauth: {
						client_id: auth.oauthClientId,
						scopes,
						resource: auth.oauthResource ?? null,
					},
					current_workspace_id: auth.workspaceId,
					workspaces,
				},
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	}),
);
