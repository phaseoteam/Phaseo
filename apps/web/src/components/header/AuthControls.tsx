// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { connection } from "next/server";
import { getHeaderAccountData } from "./getHeaderAccountData";
import HeaderClient from "./HeaderClient";

export default async function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
	// Supabase Auth reads token expiry during initialization. Explicitly defer
	// that indirect Date.now() access until a request is available.
	await connection();
	const data = await getHeaderAccountData();

	if (!data.isLoggedIn) {
		return (
			<HeaderClient
				isLoggedIn={false}
				user={undefined}
				teams={[]}
				displayPreferences={undefined}
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
			displayPreferences={data.displayPreferences}
			currentTeamId={data.currentTeamId}
			userRole={data.userRole}
			providerMode={data.providerMode}
			variant={variant}
		/>
	);
}
