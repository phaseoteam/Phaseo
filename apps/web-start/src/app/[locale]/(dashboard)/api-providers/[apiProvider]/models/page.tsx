import { redirect } from "next/navigation";

export const instant = false;

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = await params;
	redirect(`/api-providers/${encodeURIComponent(apiProvider)}#models`);
}
