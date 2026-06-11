import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

type HeaderTeam = {
	id: string;
	name: string;
};

export type InternalAuthHeaderUser = {
	id: string;
	email: string | null;
	displayName: string | null;
	avatarUrl: string | null;
};

export type InternalAuthHeaderData = {
	isLoggedIn: boolean;
	user?: InternalAuthHeaderUser;
	teams: HeaderTeam[];
	currentTeamId?: string;
	userRole?: string;
};

function unauthenticatedHeaderData(): InternalAuthHeaderData {
	return {
		isLoggedIn: false,
		teams: [],
	};
}

function readMetadataString(
	metadata: Record<string, unknown> | undefined,
	key: string,
) {
	const value = metadata?.[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function toHeaderUser(
	user: {
		id: string;
		email?: string | null;
		user_metadata?: Record<string, unknown>;
	},
	displayName: string | null,
): InternalAuthHeaderUser {
	const metadata = user.user_metadata;
	return {
		id: user.id,
		email: user.email ?? null,
		displayName:
			displayName ??
			readMetadataString(metadata, "full_name") ??
			readMetadataString(metadata, "name"),
		avatarUrl: readMetadataString(metadata, "avatar_url"),
	};
}

export async function GET() {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	const { data: getUserData } = await supabase.auth.getUser();
	const user = getUserData?.user ?? null;

	let currentTeamId: string | undefined;
	let userRole: string | undefined;
	let userDisplayName: string | null = null;

	try {
		const cookieStore = await cookies();
		const cookie = cookieStore.get("activeWorkspaceId");
		if (cookie?.value) {
			currentTeamId = cookie.value;
		}

		if (user) {
			try {
				const u = await supabase
					.from("users")
					.select("default_workspace_id, role, display_name")
					.eq("user_id", user.id)
					.single();

				if (!u.error && u.data) {
					if (!currentTeamId && u.data.default_workspace_id) {
						currentTeamId = String(u.data.default_workspace_id);
					}
					if (u.data.role) {
						userRole = String(u.data.role);
					}
					if (u.data.display_name) {
						userDisplayName = String(u.data.display_name);
					}
				}
			} catch {
				// Ignore optional header metadata failures.
			}
		}
	} catch {
		// Ignore cookie read errors.
	}

	if (!user) {
		return NextResponse.json(unauthenticatedHeaderData());
	}

	let teams: HeaderTeam[] = [];
	try {
		const { data: userRow } = await readClient
			.from("users")
			.select("default_workspace_id, role, display_name")
			.eq("user_id", user.id)
			.maybeSingle();

		const defaultWorkspaceId =
			String(userRow?.default_workspace_id ?? "").trim() || null;
		const normalizedRole = String(userRow?.role ?? "").trim().toLowerCase() || null;
		userDisplayName =
			userDisplayName ?? (String(userRow?.display_name ?? "").trim() || null);

		const { data: membershipRows } = await readClient
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", user.id);

		const membershipWorkspaceIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => String(row?.workspace_id ?? "").trim())
					.filter(Boolean),
			),
		);

		const { data: ownedWorkspaceRows } = await readClient
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", user.id);

		const ownedWorkspaceIds = Array.from(
			new Set(
				(ownedWorkspaceRows ?? [])
					.map((row: any) => String(row?.id ?? "").trim())
					.filter(Boolean),
			),
		);

		const accessibleWorkspaceIds = Array.from(
			new Set(
				[
					...membershipWorkspaceIds,
					...ownedWorkspaceIds,
					...(defaultWorkspaceId ? [defaultWorkspaceId] : []),
				].filter(Boolean),
			),
		);

		const normalizeWorkspace = (row: any): HeaderTeam | null => {
			const id = String(row?.id ?? row?.workspace_id ?? "").trim();
			const rawName = String(row?.name ?? "").trim();
			if (!id) return null;
			const name =
				rawName ||
				(defaultWorkspaceId && id === defaultWorkspaceId
					? "Personal Workspace"
					: "");
			if (!name) return null;
			return { id, name };
		};

		const mergeById = (existing: HeaderTeam[], next: HeaderTeam[]) => {
			const merged = new Map(existing.map((team) => [team.id, team]));
			for (const team of next) merged.set(team.id, team);
			return Array.from(merged.values());
		};

		const { data: membershipTeams } = await supabase
			.from("workspace_members")
			.select("workspace_id, workspaces(id, name)")
			.eq("user_id", user.id);

		teams = (membershipTeams ?? [])
			.map((row: any) => {
				const workspace = Array.isArray(row?.workspaces)
					? row.workspaces[0]
					: row?.workspaces;
				return normalizeWorkspace({
					id: workspace?.id ?? row?.workspace_id,
					name: workspace?.name,
				});
			})
			.filter((team: HeaderTeam | null): team is HeaderTeam => Boolean(team));

		if (accessibleWorkspaceIds.length) {
			const { data: scopedTeams } = await readClient
				.from("workspaces")
				.select("id, name")
				.in("id", accessibleWorkspaceIds);
			const normalizedScopedTeams = (scopedTeams ?? [])
				.map((row: any) => normalizeWorkspace(row))
				.filter((team: HeaderTeam | null): team is HeaderTeam =>
					Boolean(team),
				);
			teams = mergeById(teams, normalizedScopedTeams);
		}

		if (teams.length === 0 && defaultWorkspaceId) {
			const { data: defaultWorkspaceRows } = await readClient
				.from("workspaces")
				.select("id, name")
				.eq("id", defaultWorkspaceId)
				.limit(1);
			teams = (defaultWorkspaceRows ?? [])
				.map((row: any) => normalizeWorkspace(row))
				.filter((team: HeaderTeam | null): team is HeaderTeam =>
					Boolean(team),
				);
		}

		if (
			teams.length === 0 &&
			(normalizedRole === "admin" || normalizedRole === "editor")
		) {
			const { data: allWorkspaces } = await readClient
				.from("workspaces")
				.select("id, name");
			teams = (allWorkspaces ?? [])
				.map((row: any) => normalizeWorkspace(row))
				.filter((team: HeaderTeam | null): team is HeaderTeam =>
					Boolean(team),
				);
		}

		if (defaultWorkspaceId) {
			teams = [
				...teams.filter((team) => team.id === defaultWorkspaceId),
				...teams.filter((team) => team.id !== defaultWorkspaceId),
			];
		}
	} catch {
		teams = [];
	}

	return NextResponse.json({
		isLoggedIn: true,
		user: toHeaderUser(user, userDisplayName),
		teams,
		currentTeamId,
		userRole,
	} satisfies InternalAuthHeaderData);
}
