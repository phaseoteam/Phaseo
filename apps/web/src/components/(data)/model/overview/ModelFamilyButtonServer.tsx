import getFamilyModels from "@/lib/fetchers/models/getFamilyModels";
import ModelFamilyButtonClient from "./ModelFamilyButtonClient";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export default async function ModelFamilyButtonServer({
	familyId,
}: {
	familyId: string | null | undefined;
}) {
	if (!familyId) return null;

	try {
		const includeHidden = await resolveIncludeHidden();
		const family = await getFamilyModels(familyId, includeHidden);
		if (!family) return null;
		return <ModelFamilyButtonClient family={family} />;
	} catch (err) {
		// Don't crash the page for fetch errors; silently render nothing
		// In future we could log to telemetry
		return null;
	}
}
