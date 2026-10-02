import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = await params;
	redirect(`/api-providers/${apiProvider}/models`);
}
