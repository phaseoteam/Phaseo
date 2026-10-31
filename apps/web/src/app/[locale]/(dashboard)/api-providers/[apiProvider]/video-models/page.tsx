import { use } from "react";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { redirect } from "@/lib/navigation";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = use(params);
	redirect(`/api-providers/${apiProvider}/models`);
}
