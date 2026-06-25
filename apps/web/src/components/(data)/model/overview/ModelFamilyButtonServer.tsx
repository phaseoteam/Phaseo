import { fetchFrontendFamily } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ModelFamilyButtonClient from "./ModelFamilyButtonClient";

export default async function ModelFamilyButtonServer({
	familyId,
}: {
	familyId: string | null | undefined;
}) {
	if (!familyId) return null;

	let family;
	try {
		family = await fetchFrontendFamily(familyId);
	} catch {
		// Don't crash the page for fetch errors; silently render nothing
		// In future we could log to telemetry
		return null;
	}

	if (!family) return null;
	return <ModelFamilyButtonClient family={family} />;
}
