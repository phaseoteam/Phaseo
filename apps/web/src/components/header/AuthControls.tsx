// components/header/AuthControls.tsx  (SERVER COMPONENT)
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import HeaderClient from "./HeaderClient";

export default async function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
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
			variant={variant}
		/>
	);
}
