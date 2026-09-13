import { CatalogNavigation } from "./CatalogNavigation";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { connection } from "next/server";
import { Suspense } from "react";

async function AuthenticatedCatalog({ children }: { children: React.ReactNode }) {
	await connection();
	await requireInternalAdmin("/internal");
	return <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6">
		<CatalogNavigation />
		{children}
	</div>;
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
	return <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading catalog…</p>}>
		<AuthenticatedCatalog>{children}</AuthenticatedCatalog>
	</Suspense>;
}
