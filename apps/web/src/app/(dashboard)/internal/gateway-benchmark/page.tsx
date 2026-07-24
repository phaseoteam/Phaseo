import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import GatewayBenchmarkClient from "./GatewayBenchmarkClient";

export const metadata = {
	title: "Gateway Benchmark - Internal",
	description:
		"Run side-by-side visual comparisons of Phaseo Gateway and OpenRouter using public client-visible streaming metrics.",
};

export default async function GatewayBenchmarkPage() {
	await requireInternalAdmin();

	return <GatewayBenchmarkClient />;
}
