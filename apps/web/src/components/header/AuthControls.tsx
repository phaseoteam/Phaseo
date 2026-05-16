// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { cookies } from "next/headers";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import HeaderClient from "./HeaderClient";

export default async function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	// supabase.auth.getUser() returns { data: { user } }
	const { data: getUserData } = await supabase.auth.getUser();
	const user = getUserData?.user ?? null;

	// Determine current active team id: prefer cookie, else fallback to user's default_workspace_id
	let currentTeamId: string | undefined = undefined;
	// fetch user role from users table (if available)
	let userRole: string | undefined = undefined;

	try {
		const cookieStore = await cookies();
		const cookie = await cookieStore.get("activeWorkspaceId");
		if (cookie?.value) {
			currentTeamId = cookie.value;
		}

		// Regardless of cookie, if we have a logged-in user try to fetch their role
		if (user) {
			try {
				const u = await supabase
					.from("users")
					.select("default_workspace_id, role")
					.eq("user_id", user.id)
					.single();

				if (!u.error && u.data) {
					if (!currentTeamId && u.data.default_workspace_id) {
						currentTeamId = String(u.data.default_workspace_id);
					}
					if (u.data.role) {
						userRole = String(u.data.role);
					}
				}
			} catch {
				// ignore
			}
		}
	} catch {
		// ignore cookie read errors
	}

	if (!user) {
		return (
			<HeaderClient
				isLoggedIn={false}
				user={undefined}
				teams={[]}
				currentTeamId={undefined}
				userRole={undefined}
				variant={variant}
			/>
		);
	}

	// Fetch teams for the team switcher. If the table doesn't exist, return empty array.
	let teams: { id: string; name: string }[] = [];
	try {
		if (user) {
			const { data: userRow } = await readClient
				.from("users")
				.select("default_workspace_id, role")
				.eq("user_id", user.id)
				.maybeSingle();

			const defaultWorkspaceId =
				String(userRow?.default_workspace_id ?? "").trim() || null;
			const normalizedRole = String(userRow?.role ?? "").trim().toLowerCase() || null;

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

			const normalizeWorkspace = (row: any): { id: string; name: string } | null => {
				const id = String(row?.id ?? row?.workspace_id ?? "").trim();
				const rawName = String(row?.name ?? "").trim();
				if (!id) return null;
				const name =
					rawName || (defaultWorkspaceId && id === defaultWorkspaceId ? "Personal Workspace" : "");
				if (!name) return null;
				return { id, name };
			};

			const mergeById = (
				existing: { id: string; name: string }[],
				next: { id: string; name: string }[],
			) => {
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
					const workspace =
						Array.isArray(row?.workspaces) ? row.workspaces[0] : row?.workspaces;
					return normalizeWorkspace({
						id: workspace?.id ?? row?.workspace_id,
						name: workspace?.name,
					});
				})
				.filter(
					(team: { id: string; name: string } | null): team is { id: string; name: string } =>
						Boolean(team),
				);

			if (accessibleWorkspaceIds.length) {
				const { data: scopedTeams } = await readClient
					.from("workspaces")
					.select("id, name")
					.in("id", accessibleWorkspaceIds);
				const normalizedScopedTeams = (scopedTeams ?? [])
					.map((row: any) => normalizeWorkspace(row))
					.filter(
						(team: { id: string; name: string } | null): team is { id: string; name: string } =>
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
					.filter(
						(team: { id: string; name: string } | null): team is { id: string; name: string } =>
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
					.filter(
						(team: { id: string; name: string } | null): team is { id: string; name: string } =>
							Boolean(team),
					);
			}

			if (defaultWorkspaceId) {
				teams = [
					...teams.filter((team) => team.id === defaultWorkspaceId),
					...teams.filter((team) => team.id !== defaultWorkspaceId),
				];
			}
		}
	} catch {
		// ignore and keep teams empty
	}

	// HeaderClient expects teams as array or undefined, not null
	const safeTeams = teams ?? undefined;

	return (
		<HeaderClient
			isLoggedIn={true}
			user={user}
			teams={safeTeams}
			currentTeamId={currentTeamId}
			userRole={userRole}
			variant={variant}
		/>
	);
}
