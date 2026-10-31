import { use } from "react";
import { redirect } from "@/lib/navigation";

export default function RequestLogPage(props: {
	params: Promise<{ requestId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { requestId } = use(props.params);
	const searchParams = use(props.searchParams);
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams)) {
		if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
		else if (typeof value === "string") params.set(key, value);
	}
	redirect(`/settings/usage/logs/requests/${encodeURIComponent(decodeURIComponent(requestId))}${params.size ? `?${params.toString()}` : ""}`);
}
