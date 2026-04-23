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

	// Determine current active workspace id: prefer cookie, else user's default_workspace_id.
	let currentWorkspaceId: string | undefined = undefined;
	// fetch user role from users table (if available)
	let userRole: string | undefined = undefined;
	let defaultWorkspaceId: string | undefined = undefined;
	let membershipWorkspaceIds: string[] = [];
	let ownedWorkspaceIds: string[] = [];

	try {
		const cookieStore = await cookies();
		const cookie = await cookieStore.get("activeWorkspaceId");
		if (cookie?.value) {
			currentWorkspaceId = cookie.value;
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
				}

				const ownedWorkspaces = await readClient
					.from("workspaces")
					.select("id")
					.eq("owner_user_id", user.id);
				if (!ownedWorkspaces.error) {
					ownedWorkspaceIds = Array.from(
						new Set(
							(ownedWorkspaces.data ?? [])
								.map((row: any) => String(row?.id ?? "").trim())
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
				workspaces={[]}
				currentWorkspaceId={undefined}
				userRole={undefined}
				variant={variant}
			/>
		);
	}

	// Fetch workspaces for the switcher.
	let workspaces: { id: string; name: string }[] = [];
	try {
		const accessibleWorkspaceIds = Array.from(
			new Set([...membershipWorkspaceIds, ...ownedWorkspaceIds]),
		);

		const membershipWorkspaces = await supabase
			.from("workspace_members")
			.select("workspace_id, workspaces(id, name)")
			.eq("user_id", user.id);
		if (!membershipWorkspaces.error && Array.isArray(membershipWorkspaces.data)) {
			workspaces = membershipWorkspaces.data
				.map((row: any) => {
					const workspace =
						Array.isArray(row?.workspaces) ? row.workspaces[0] : row?.workspaces;
					const id = String(workspace?.id ?? row?.workspace_id ?? "").trim();
					const name = String(workspace?.name ?? "").trim();
					if (!id || !name) return null;
					return { id, name };
				})
				.filter((row): row is { id: string; name: string } => Boolean(row));
		}

		if (accessibleWorkspaceIds.length > 0) {
			const scoped = await readClient
				.from("workspaces")
				.select("id, name")
				.in("id", accessibleWorkspaceIds);
			if (!scoped.error && Array.isArray(scoped.data)) {
				const scopedWorkspaces = scoped.data.map((row: any) => ({
					id: String(row.id),
					name: String(row.name),
				}));
				if (workspaces.length === 0) {
					workspaces = scopedWorkspaces;
				} else {
					const merged = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
					for (const workspace of scopedWorkspaces) {
						merged.set(workspace.id, workspace);
					}
					workspaces = Array.from(merged.values());
				}
			}
		}

		if (
			workspaces.length === 0 &&
			defaultWorkspaceId &&
			accessibleWorkspaceIds.includes(defaultWorkspaceId)
		) {
			const scoped = await readClient
				.from("workspaces")
				.select("id, name")
				.eq("id", defaultWorkspaceId)
				.limit(1);
			if (!scoped.error && Array.isArray(scoped.data)) {
				workspaces = scoped.data.map((row: any) => ({
					id: String(row.id),
					name: String(row.name),
				}));
			}
		}

	} catch {
		// ignore and keep workspaces empty
	}

	const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
	const cookieWorkspaceId =
		currentWorkspaceId && workspaceIds.has(currentWorkspaceId)
			? currentWorkspaceId
			: undefined;
	if (cookieWorkspaceId) {
		currentWorkspaceId = cookieWorkspaceId;
	} else if (defaultWorkspaceId && workspaceIds.has(defaultWorkspaceId)) {
		currentWorkspaceId = defaultWorkspaceId;
	} else {
		currentWorkspaceId = workspaces[0]?.id;
	}

	// HeaderClient expects workspaces as array or undefined, not null
	const safeWorkspaces = workspaces ?? undefined;

	return (
		<HeaderClient
			isLoggedIn={true}
			user={user}
			workspaces={safeWorkspaces}
			currentWorkspaceId={currentWorkspaceId}
			userRole={userRole}
			variant={variant}
		/>
	);
}
