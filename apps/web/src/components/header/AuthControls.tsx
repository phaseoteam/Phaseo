// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
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
	let defaultWorkspaceId: string | undefined = undefined;
	let membershipWorkspaceIds: string[] = [];

	try {
		const cookieStore = await cookies();
		const cookie = await cookieStore.get("activeWorkspaceId");
		if (cookie?.value) {
			currentTeamId = cookie.value;
		}

		// Regardless of cookie, if we have a logged-in user try to fetch their role
		if (user) {
			try {
				const u = await readClient
					.from("users")
					.select("default_workspace_id, role")
					.eq("user_id", user.id)
					.single();

				if (!u.error && u.data) {
					defaultWorkspaceId = String(
						u.data.default_workspace_id ?? "",
					).trim();
					if (u.data.role) {
						userRole = String(u.data.role);
					}
				} else {
					const legacy = await (readClient as any)
						.from("users")
						.select("default_team_id, role")
						.eq("user_id", user.id)
						.single();
					if (!legacy.error && legacy.data) {
						defaultWorkspaceId = String(
							legacy.data.default_team_id ?? "",
						).trim();
						if (legacy.data.role) {
							userRole = String(legacy.data.role);
						}
					}
				}

				const memberships = await readClient
					.from("workspace_members")
					.select("workspace_id")
					.eq("user_id", user.id);
				if (!memberships.error) {
					membershipWorkspaceIds = Array.from(
						new Set(
							(memberships.data ?? [])
								.map((row: any) =>
									String(row?.workspace_id ?? "").trim(),
								)
								.filter(Boolean),
						),
					);
				} else {
					const legacyMemberships = await (readClient as any)
						.from("team_members")
						.select("team_id")
						.eq("user_id", user.id);
					membershipWorkspaceIds = Array.from(
						new Set(
							(legacyMemberships.data ?? [])
								.map((row: any) =>
									String(row?.team_id ?? "").trim(),
								)
								.filter(Boolean),
						),
					);
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
		if (membershipWorkspaceIds.length > 0) {
			const scoped = await readClient
				.from("workspaces")
				.select("id, name")
				.in("id", membershipWorkspaceIds);
			if (!scoped.error && Array.isArray(scoped.data)) {
				teams = scoped.data.map((row: any) => ({
					id: String(row.id),
					name: String(row.name),
				}));
			} else {
				const legacyScoped = await (readClient as any)
					.from("teams")
					.select("id, name")
					.in("id", membershipWorkspaceIds);
				if (!legacyScoped.error && Array.isArray(legacyScoped.data)) {
					teams = legacyScoped.data.map((row: any) => ({
						id: String(row.id),
						name: String(row.name),
					}));
				}
			}
		}

		if (teams.length === 0) {
			const res = await readClient.from("workspaces").select("id, name");
			const data = res.data as any[] | null;
			const error = res.error;
			if (!error && Array.isArray(data)) {
				teams = data.map((d) => ({
					id: String(d.id),
					name: String(d.name),
				}));
			} else {
				const legacyRes = await (readClient as any)
					.from("teams")
					.select("id, name");
				if (!legacyRes.error && Array.isArray(legacyRes.data)) {
					teams = legacyRes.data.map((d: any) => ({
						id: String(d.id),
						name: String(d.name),
					}));
				}
			}
		}
	} catch {
		// ignore and keep teams empty
	}

	const teamIds = new Set(teams.map((team) => team.id));
	const cookieTeamId = currentTeamId && teamIds.has(currentTeamId) ? currentTeamId : undefined;
	if (cookieTeamId) {
		currentTeamId = cookieTeamId;
	} else if (defaultWorkspaceId && teamIds.has(defaultWorkspaceId)) {
		currentTeamId = defaultWorkspaceId;
	} else {
		currentTeamId = teams[0]?.id;
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
