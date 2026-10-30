import { redirect } from "next/navigation";

export default async function RequestLogPage(props: {
	params: Promise<{ requestId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { requestId } = await props.params;
	const searchParams = await props.searchParams;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams)) {
		if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
		else if (typeof value === "string") params.set(key, value);
	}
	redirect(`/settings/usage/logs/requests/${encodeURIComponent(decodeURIComponent(requestId))}${params.size ? `?${params.toString()}` : ""}`);
}
