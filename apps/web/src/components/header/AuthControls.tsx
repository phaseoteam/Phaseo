// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import HeaderClient from "./HeaderClient";

export default async function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
	const supabase = await createClient();

	// supabase.auth.getUser() returns { data: { user } }
	const { data: getUserData } = await supabase.auth.getUser();
	const user = getUserData?.user ?? null;

	// Determine current active team id: prefer cookie, else fallback to user's default_team_id
	let currentTeamId: string | undefined = undefined;
	// fetch user role from users table (if available)
	let userRole: string | undefined = undefined;

	try {
		const cookieStore = await cookies();
		const cookie = await cookieStore.get("activeTeamId");
		if (cookie?.value) {
			currentTeamId = cookie.value;
		}

		// Regardless of cookie, if we have a logged-in user try to fetch their role
		if (user) {
			try {
				const u = await supabase
					.from("users")
					.select("default_team_id, role")
					.eq("user_id", user.id)
					.single();

				if (!u.error && u.data) {
					if (!currentTeamId && u.data.default_team_id) {
						currentTeamId = String(u.data.default_team_id);
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
		const res = await supabase.from("teams").select("id, name");
		const data = res.data as any[] | null;
		const error = res.error;
		if (!error && Array.isArray(data)) {
			teams = data.map((d) => ({
				id: String(d.id),
				name: String(d.name),
			}));
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
