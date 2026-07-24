import { redirect } from "next/navigation";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export async function requireInternalAdmin(forbiddenPath = "/"): Promise<void> {
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn) redirect("/sign-in");
	if (!status.isAdmin) redirect(forbiddenPath);
}
