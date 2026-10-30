"use client";
import { useTranslations } from "next-intl";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";
import ProviderCatalogManager from "@/components/(gateway)/settings/account/ProviderCatalogManager";
import { Button } from "@/components/ui/button";
import { fetchProviderCatalogLinksAction } from "@/app/(dashboard)/settings/account/providers/actions";

export function ProviderCatalogDockPanel({ userId, onDirtyChange }: { userId: string; onDirtyChange?: (dirty: boolean) => void }) {
	const tx = useTranslations();
	const query = useQuery({
		queryKey: ["providerCatalogLinks", userId],
		queryFn: fetchProviderCatalogLinksAction,
	});

	if (query.isPending) {
		return <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{tx("Common.ui.actionDockCopy.loadingYourCatalogs" as never)}</div>;
	}

	if (query.isError) {
		return <div className="space-y-3 px-4 py-10 text-center">
			<p role="alert" className="text-sm text-destructive">{tx("Common.ui.actionDockCopy.yourProviderCatalogsCouldNotBeLoaded" as never)}</p>
			<Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
				<RefreshCw className={query.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />{tx("Common.ui.workspaceSwitcher.tryAgain" as never)}
			</Button>
		</div>;
	}

	if (!query.data.length) {
		return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tx("Common.ui.actionDockCopy.noProviderCatalogsAreAvailableForThisAccount" as never)}</p>;
	}

	return <ProviderCatalogManager providers={query.data} onDirtyChange={onDirtyChange} />;
}
