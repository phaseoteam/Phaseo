export async function postClientAuthSignOut() {
	const response = await fetch("/api/internal/auth/sign-out", {
		method: "POST",
		cache: "no-store",
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to sign out: ${response.status}`);
	}
}
