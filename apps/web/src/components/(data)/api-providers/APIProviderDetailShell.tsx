import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Scale } from "lucide-react";

import { fetchFrontendAPIProviderHeader } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import APIProviderEditButton from "./edit/APIProviderEditButton";
import AccountPolicyNotice from "../AccountPolicyNotice";
import ModelPageToc, { type ModelPageTocItem } from "../model/ModelPageToc";
import EntityStickyHeader from "../EntityStickyHeader";
import { Button } from "@/components/ui/button";
import { getLocale, getTranslations } from "next-intl/server";

interface APIProviderDetailShellProps {
	apiProviderId: string;
	children: ReactNode;
	tocItems?: ModelPageTocItem[];
}

export default async function APIProviderDetailShell({
	apiProviderId,
	children,
	tocItems = [],
}: APIProviderDetailShellProps) {
	const header = await fetchFrontendAPIProviderHeader(apiProviderId).catch(() => null);
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.providers");

	if (!header) {
		notFound();
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center md:p-8">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">🏢</span>
						</div>
						<p className="text-base font-medium">
							{t("missingTitle")}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("missingDescription")}
						</p>
						<div className="mt-3">
							<a
								href="https://github.com/phaseoteam/Phaseo"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								{t("contribute")}
								<Image
									src="/social/github_light.svg"
								alt="GitHub"
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
								alt="GitHub"
									width={16}
									height={16}
									className="hidden dark:inline"
								/>
							</a>
						</div>
					</div>
				</div>
			</main>
		);
	}
	const countryName = header.country_code
		? new Intl.DisplayNames([locale], { type: "region" }).of(header.country_code.toUpperCase()) ?? header.country_code
		: null;

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="provider" id={apiProviderId} name={header.api_provider_name} observeId="provider-detail-primary-header" baseHref={`/api-providers/${apiProviderId}`} navigation={[]} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<AccountPolicyNotice kind="provider" id={apiProviderId} />
				<div id="provider-detail-primary-header" className="mb-6 flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 items-center gap-4">
						<div className="relative flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
								<div className="relative size-10">
									<Logo
										id={header.api_provider_id}
										alt={header.api_provider_name}
										className="object-contain"
										fill
									/>
								</div>
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-3xl font-bold tracking-tight">
								{header.api_provider_name}
							</h1>
							{countryName ? (
								<Link href={`/countries/${header.country_code.toLowerCase()}`} className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4">
									<MapPin className="size-3.5" />
									{countryName}
								</Link>
							) : null}
						</div>
					</div>
					<div className="flex w-full gap-2 sm:w-auto sm:flex-col">
						<Button asChild variant="outline" size="sm" className="flex-1 rounded-lg sm:flex-none"><Link href={`/api-providers/compare?providers=${encodeURIComponent(apiProviderId)}`}><Scale className="size-4" />{t("compareButton")}</Link></Button>
						<APIProviderEditButton apiProviderId={apiProviderId} />
					</div>
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
