import { permanentRedirect } from "next/navigation";

export default async function Page(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = await props.searchParams;

	const params = new URLSearchParams();
	if (sp) {
		for (const [k, v] of Object.entries(sp)) {
			if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
			else if (typeof v === "string") params.append(k, v);
		}
	}

	const qs = params.toString();
	permanentRedirect(qs ? `/settings/usage?${qs}` : "/settings/usage");
}

