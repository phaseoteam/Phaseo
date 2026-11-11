import { useSuspenseQuery } from "@tanstack/react-query";
import ModelFamilyButtonClient from "./ModelFamilyButtonClient";
import { modelFamilyButtonQuery } from "./ModelFamilyButtonServer.queries";

export default function ModelFamilyButtonServer({
	familyId,
}: {
	familyId: string | null | undefined;
}) {
	if (!familyId) return null;
	return <ModelFamilyButton familyId={familyId} />;
}

function ModelFamilyButton({ familyId }: { familyId: string }) {
	// Don't crash the page for fetch errors; the query resolves to null and
	// this renders nothing. In future we could log to telemetry
	const { data: family } = useSuspenseQuery(modelFamilyButtonQuery(familyId));

	if (!family) return null;
	return <ModelFamilyButtonClient family={family} />;
}
