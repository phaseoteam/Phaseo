// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { connection } from "next/server";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import HeaderClient from "./HeaderClient";

export default async function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
	// Supabase Auth reads token expiry during initialization. Explicitly defer
	// that indirect Date.now() access until a request is available.
	await connection();
	let data: InternalAuthHeaderData = {
		isLoggedIn: false,
		user: undefined,
		teams: [],
		currentTeamId: undefined,
		userRole: undefined,
	};
	try {
		data = await fetchInternalAuthHeaderData();
	} catch {
		// Keep the header renderable if the internal route is unavailable.
	}

	if (!data.isLoggedIn) {
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

	return (
		<HeaderClient
			isLoggedIn={true}
			user={data.user}
			teams={data.teams}
			currentTeamId={data.currentTeamId}
			userRole={data.userRole}
			providerMode={data.providerMode}
			variant={variant}
		/>
	);
}
