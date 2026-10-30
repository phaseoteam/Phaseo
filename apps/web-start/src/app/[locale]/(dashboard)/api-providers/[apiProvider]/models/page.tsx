import { use } from "react";
import { redirect } from "next/navigation";

export const instant = false;

export default function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = use(params);
	redirect(`/api-providers/${encodeURIComponent(apiProvider)}#models`);
}
