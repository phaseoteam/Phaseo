import Link from "next/link";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { BillingReviews } from "./BillingReviews";
import type { Review } from "./types";

export const metadata = { title: "Realtime billing review", robots: { index: false, follow: false } };

export default async function RealtimeBillingPage({ searchParams }: { searchParams: Promise<{ state?: string; offset?: string }> }) {
	await requireInternalAdmin();
	const [{ accessToken }, params] = await Promise.all([getServerAccountContext(), searchParams]);
	const state = params.state === "resolved" ? "resolved" : "open";
	const offset = Math.min(10000, Math.max(0, Math.floor(Number(params.offset) || 0)));
	const data = await fetchInternalWebApi<{ reviews: Review[]; total: number }>(
		`/api/internal/realtime-billing/reviews?state=${state}&offset=${offset}`, accessToken);
	return <main className="container mx-auto space-y-6 px-4 py-8">
		<header className="space-y-2"><h1 className="text-2xl font-semibold">Realtime billing review</h1>
			<p className="text-sm text-muted-foreground">Resolve missing usage using server evidence. Holds are not charges.</p></header>
		<nav aria-label="Review status" className="flex gap-4 text-sm">
			<Link href="?state=open" aria-current={state === "open" ? "page" : undefined} className={state === "open" ? "font-semibold underline" : "text-muted-foreground"}>Open</Link>
			<Link href="?state=resolved" aria-current={state === "resolved" ? "page" : undefined} className={state === "resolved" ? "font-semibold underline" : "text-muted-foreground"}>Resolved</Link>
		</nav>
		<BillingReviews reviews={data.reviews} />
		<nav aria-label="Review pages" className="flex gap-4 text-sm"><span>{data.total} reviews</span>
			{offset > 0 && <Link href={`?state=${state}&offset=${Math.max(0, offset - 50)}`}>Previous</Link>}
			{offset + 50 < data.total && <Link href={`?state=${state}&offset=${offset + 50}`}>Next</Link>}
		</nav>
	</main>;
}
