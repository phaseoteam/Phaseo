import { CatalogNavigation } from "@/app/(dashboard)/internal/data/CatalogNavigation";
import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";

// The admin gate (requireInternalAdmin("/internal")) runs in the route's beforeLoad.
function AuthenticatedCatalog({ children }: { children: React.ReactNode }) {
	return <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6">
		<CatalogNavigation />
		{children}
	</div>;
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
	const t = useTranslations("Product.internalTools.dataEditor");
	return <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("loadingCatalog")}</p>}>
		<AuthenticatedCatalog>{children}</AuthenticatedCatalog>
	</Suspense>;
}
