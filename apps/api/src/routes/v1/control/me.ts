import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { getSupabaseAdmin } from "@/runtime/env";
import { bearerToken, claimsScopes, validateLocalAccessToken } from "@/lib/oauth/service";
import { json, withRuntime } from "@/routes/utils";

export const meRoutes = new Hono<Env>();

meRoutes.get(
	"/",
	withRuntime(async (req) => {
		const token = bearerToken(req);
		if (!token) {
			return json(
				{ error: "unauthorised", message: "Bearer access token is required" },
				401,
				{ "Cache-Control": "no-store" },
			);
		}
		const validation = await validateLocalAccessToken(token);
		if (!validation.valid || !validation.claims) {
			return json(
				{ error: "unauthorised", message: validation.error ?? "Invalid access token" },
				401,
				{ "Cache-Control": "no-store" },
			);
		}

		const claims = validation.claims;
		const scopes = claimsScopes(claims);
		if (!scopes.includes(CAPABILITIES.ME_READ)) {
			return json(
				{ error: "insufficient_scope", message: `Token requires ${CAPABILITIES.ME_READ}` },
				403,
				{ "Cache-Control": "no-store" },
			);
		}
		const supabase = getSupabaseAdmin();
		const [userResult, membershipsResult] = await Promise.all([
			supabase.auth.admin.getUserById(claims.user_id),
			supabase
				.from("workspace_members")
				.select("role, workspace_id, workspaces:workspaces(id, name, slug)")
				.eq("user_id", claims.user_id),
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
				current: String(row.workspace_id) === claims.workspace_id,
			};
		});

		return json(
			{
				data: {
					user: {
						id: claims.user_id,
						email: user?.email ?? claims.email ?? null,
						name:
							typeof metadata.full_name === "string"
								? metadata.full_name
								: typeof metadata.name === "string"
									? metadata.name
									: (claims as any).name ?? null,
					},
					oauth: {
						client_id: claims.client_id,
						scopes,
					},
					current_workspace_id: claims.workspace_id,
					workspaces,
				},
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	}),
);
