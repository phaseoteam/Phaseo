"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safelyDecodePathSegments } from "./safePathname";

export type CatalogResourceType = "model" | "organisation" | "country" | "provider";

const resourceConfig: Record<
	CatalogResourceType,
	{
		browseHref: string;
		pathSegments: number;
	}
> = {
	model: {
		browseHref: "/models",
		pathSegments: 2,
	},
	organisation: {
		browseHref: "/organisations",
		pathSegments: 1,
	},
	country: {
		browseHref: "/countries",
		pathSegments: 1,
	},
	provider: {
		browseHref: "/api-providers",
		pathSegments: 1,
	},
};

function getResourceIdFromPathname(
	pathname: string | null,
	resourceType: CatalogResourceType,
): string | null {
	if (!pathname) return null;
	const segments = pathname.split("/").filter(Boolean);
	const config = resourceConfig[resourceType];
	const resourceIndex = segments.findIndex((segment) =>
		(resourceType === "model" && segment === "models") ||
		(resourceType === "organisation" && segment === "organisations") ||
		(resourceType === "country" && segment === "countries") ||
		(resourceType === "provider" && segment === "api-providers"),
	);
	if (resourceIndex === -1) return null;
	const resourceId = segments.slice(resourceIndex + 1, resourceIndex + 1 + config.pathSegments);
	if (resourceId.length !== config.pathSegments) return null;
	return safelyDecodePathSegments(resourceId);
}

export default function CatalogNotFoundState({
	resourceType,
	resourceId,
}: {
	resourceType: CatalogResourceType;
	resourceId?: string;
}) {
	const t = useTranslations("Catalogue.catalogNotFound");
	const pathname = usePathname();
	const config = resourceConfig[resourceType];
	const requestedId = resourceId ?? getResourceIdFromPathname(pathname, resourceType) ?? "—";
	const copy = {
		model: {
			heading: t("modelHeading", { id: requestedId }),
			description: t("modelDescription"),
			requestLabel: t("requestModel"),
			browseLabel: t("browseModels"),
		},
		organisation: {
			heading: t("organisationHeading", { id: requestedId }),
			description: t("organisationDescription"),
			requestLabel: t("requestLab"),
			browseLabel: t("browseLabs"),
		},
		country: {
			heading: t("countryHeading", { id: requestedId }),
			description: t("countryDescription"),
			requestLabel: t("requestCountry"),
			browseLabel: t("browseCountries"),
		},
		provider: {
			heading: t("providerHeading", { id: requestedId }),
			description: t("providerDescription"),
			requestLabel: t("requestProvider"),
			browseLabel: t("browseProviders"),
		},
	}[resourceType];

	return (
		<main className="flex flex-1 flex-col">
			<div className="container mx-auto flex min-h-[62vh] w-full flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
				<div className="w-full max-w-2xl text-center">
					<h1 className="mx-auto max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
						{copy.heading}
					</h1>
					<p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
						{copy.description}
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
						<span>{copy.requestLabel}</span>
						<a
							href="https://discord.gg/aQyywCvgZ5"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
						>
							<Image src="/social/discord.svg" alt="" width={15} height={15} />
							Discord
						</a>
						<a
							href="https://github.com/phaseoteam/Phaseo/issues/new"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
						>
							<Image src="/social/github_light.svg" alt="" width={15} height={15} className="dark:hidden" />
							<Image src="/social/github_dark.svg" alt="" width={15} height={15} className="hidden dark:block" />
							GitHub
						</a>
					</div>

					<div className="mt-5 flex flex-wrap items-center justify-center gap-3">
						<Button asChild>
							<Link href={config.browseHref}>
								<ArrowLeft className="h-4 w-4" />
								{copy.browseLabel}
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</main>
	);
}
