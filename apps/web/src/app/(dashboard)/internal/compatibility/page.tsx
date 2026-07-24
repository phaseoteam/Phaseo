import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import CompatibilityClient from "./CompatibilityClient";

export const metadata = {
	title: "Gateway Compatibility - Internal",
	description:
		"Validate Phaseo Gateway responses against official OpenAI and Anthropic schemas, inspect mismatches, and verify response-shape compatibility before shipping changes.",
};

export default async function CompatibilityPage() {
	await requireInternalAdmin();

	return <CompatibilityClient />;
}

