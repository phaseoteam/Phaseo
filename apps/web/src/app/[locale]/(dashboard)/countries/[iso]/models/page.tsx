import { use } from "react";
import { redirect } from "@/lib/navigation";

export const instant = false;

export default function CountryModelsPage({
	params,
}: {
	params: Promise<{ iso: string }>;
}) {
	const { iso } = use(params);
	redirect(`/countries/${encodeURIComponent(iso.toLowerCase())}#models`);
}
