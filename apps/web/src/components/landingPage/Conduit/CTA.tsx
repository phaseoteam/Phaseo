import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ProviderLogoRow } from "@/components/landingPage/Conduit/ProviderLogoRow";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

export function CTA() {
	return (
		<section className="pb-20">
			<div className="container mx-auto flex flex-col items-center">
				<Card
					className="shadow-sm border-t-2"
					style={{ borderTopColor: "#0ea5e9" }}
				>
					<CardHeader>
						<CardTitle className="text-2xl">
							Start building with Conduit today.
						</CardTitle>
						<CardDescription>
							Unify your AI stack behind one surface -- with
							routing, reliability, observability, and security
							for production workloads.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap items-center gap-3">
						<Button
							asChild
							className="bg-slate-900 text-white hover:bg-slate-800"
						>
							<Link href={SALES_HREF}>Create free account</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href={DOCS_HREF}>View API docs</Link>
						</Button>
					</CardContent>
				</Card>
				<div className="h-6" />
			</div>
		</section>
	);
}
