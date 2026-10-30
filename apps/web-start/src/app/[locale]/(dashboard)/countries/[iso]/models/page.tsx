import { redirect } from "next/navigation";

export const instant = false;

export default async function CountryModelsPage({
	params,
}: {
	params: Promise<{ iso: string }>;
}) {
	const { iso } = await params;
	redirect(`/countries/${encodeURIComponent(iso.toLowerCase())}#models`);
}
