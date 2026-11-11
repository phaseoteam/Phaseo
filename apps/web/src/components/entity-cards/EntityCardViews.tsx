// One view per entity kind, all on the shared hover card layout: a header (logo,
// title, muted meta line joined with " · "), up to four stat tiles, label/value
// rows, then badges. Values come from the card endpoint; nothing here fetches.
//
// Links inside a card never preload their page (`prefetch={false}`): a card
// opens on every hover, and preloading each linked page would multiply that.
import type * as React from "react";
import { Boxes, Gauge, Layers } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import {
	HoverCardBadgeRow,
	HoverCardBody,
	HoverCardFacts,
	HoverCardStats,
	HoverCardTitle,
	joinMeta,
} from "@/components/ui/hover-card";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import type {
	AppEntityCard,
	BenchmarkEntityCard,
	CollectionEntityCard,
	CountryEntityCard,
	EntityCard,
	EntityRefList,
	FamilyEntityCard,
	ModelEntityCard,
	OrganisationEntityCard,
	ProviderEntityCard,
} from "./entityCardData";
import {
	countryName,
	formatCardDate,
	formatPercentFloor,
	formatRankChange,
	formatShare,
	formatTokensCompact,
	formatUsd,
} from "./entityCardFormat";

type Translate = ReturnType<typeof useTranslations>;

const LINK_CLASS = "font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-current";
const META_LINK_CLASS = "underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-solid";
const LOGO_SIZE = 28;

const modelHref = (id: string) => `/models/${id.split("/").map(encodeURIComponent).join("/")}`;
const providerHref = (id: string) => `/api-providers/${encodeURIComponent(id)}`;
const organisationHref = (id: string) => `/organisations/${encodeURIComponent(id)}`;
const countryHref = (code: string) => `/countries/${encodeURIComponent(code.toLowerCase())}`;

function CardLink({ href, children, className = LINK_CLASS }: { href: string; children: React.ReactNode; className?: string }) {
	return (
		<Link href={href} prefetch={false} className={className}>
			{children}
		</Link>
	);
}

/** "A, B, C +3 more", each a link that opens its own card. */
function RefList({ list, href, t }: { list: EntityRefList; href: (id: string) => string; t: Translate }) {
	if (list.items.length === 0) return null;
	return (
		<>
			{list.items.map((item, index) => (
				<span key={item.id}>
					{index > 0 ? ", " : null}
					<CardLink href={href(item.id)}>{item.name}</CardLink>
				</span>
			))}
			{list.more > 0 ? <span className="text-muted-foreground"> {t("more", { count: list.more })}</span> : null}
		</>
	);
}

function EntityLogo({ id, label }: { id: string; label: string }) {
	return <Logo id={id} alt={label} width={LOGO_SIZE} height={LOGO_SIZE} className="size-7 shrink-0 rounded-md object-contain" />;
}

function IconTile({ children }: { children: React.ReactNode }) {
	return <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-4">{children}</span>;
}

function Flag({ code, label }: { code: string; label: string }) {
	return <img src={`/flags/${code.toLowerCase()}.svg`} alt={label} width={LOGO_SIZE} height={21} className="h-[21px] w-7 shrink-0 rounded-sm object-cover" />;
}

/** Header: logo or icon, the title, then the meta line under it. */
function Header({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: ReadonlyArray<React.ReactNode> }) {
	return (
		<div className="flex min-w-0 items-start gap-2.5">
			{icon}
			<HoverCardTitle title={<span className="text-sm font-semibold">{title}</span>} meta={joinMeta(meta)} className="min-w-0 flex-1" />
		</div>
	);
}

function label(map: Record<string, string>, value: string): string {
	return map[value] ?? value.replace(/[_-]+/g, " ").replace(/^\w/, (char) => char.toUpperCase());
}

/** Stored app category codes (lib/appCategories) → their message keys. */
const APP_CATEGORY_KEYS: Record<string, string> = {
	chat: "chat",
	"developer-tools": "developerTools",
	research: "research",
	productivity: "productivity",
	education: "education",
	commerce: "commerce",
	media: "media",
	finance: "finance",
	other: "other",
};

/** Stored benchmark category codes → their message keys; synonyms share one label. */
const BENCHMARK_CATEGORY_KEYS: Record<string, string> = {
	general: "general",
	agents: "agents",
	agentic: "agents",
	code: "coding",
	coding: "coding",
	multimodal: "multimodal",
	math: "math",
	mathematics: "math",
	reasoning: "reasoning",
	language: "language",
	long_context: "longContext",
	audio: "audio",
	health: "health",
	healthcare: "health",
	embeddings: "embeddings",
	biology: "biology",
	creativity: "creativity",
	planning: "planning",
	safety: "safety",
	communication: "communication",
	image_to_text: "imageToText",
	lean_reasoning: "leanReasoning",
	"3d": "threeD",
	professional: "professional",
	legal: "legal",
	finance: "finance",
	science: "science",
	knowledge: "knowledge",
	"general-knowledge": "knowledge",
	hallucinations: "hallucinations",
	cost: "cost",
	vision: "vision",
	grounding: "grounding",
	security: "security",
	cybersecurity: "security",
	embodied: "embodied",
	economics: "economics",
	ranking: "ranking",
	chemistry: "chemistry",
	spatial_reasoning: "spatialReasoning",
	instruction_following: "instructionFollowing",
	video: "video",
	factuality: "factuality",
};

/**
 * Category codes translated at the display boundary. App categories are stored as a
 * comma-separated list; an unknown code is shown as stored, never reworded.
 */
function categoryLabel(t: Translate, scope: "appCategory" | "benchmarkCategory", stored: string): string {
	const keys = scope === "appCategory" ? APP_CATEGORY_KEYS : BENCHMARK_CATEGORY_KEYS;
	const codes = scope === "appCategory" ? stored.split(",") : [stored];
	return codes
		.map((code) => code.trim())
		.filter(Boolean)
		.map((code) => {
			const key = keys[code.toLowerCase()];
			return key ? t(`${scope}.${key}` as never) : code;
		})
		.join(", ");
}

function useLabels(t: Translate) {
	return {
		status: {
			active: t("status.active"),
			coming_soon: t("status.comingSoon"),
			deprecated: t("status.deprecated"),
			retired: t("status.retired"),
			inactive: t("status.inactive"),
			not_listed: t("status.notListed"),
		} as Record<string, string>,
		modality: {
			text: t("modality.text"),
			image: t("modality.image"),
			audio: t("modality.audio"),
			video: t("modality.video"),
			embedding: t("modality.embedding"),
			embeddings: t("modality.embedding"),
			file: t("modality.file"),
		} as Record<string, string>,
		feature: {
			reasoning: t("feature.reasoning"),
			tools: t("feature.tools"),
			structured_outputs: t("feature.structuredOutputs"),
			web_search: t("feature.webSearch"),
		} as Record<string, string>,
		tier: {
			batch: t("tier.batch"),
			flex: t("tier.flex"),
			priority: t("tier.priority"),
			fast: t("tier.priority"),
			free: t("tier.free"),
		} as Record<string, string>,
	};
}

function ModelView({ card }: { card: ModelEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const locale = useLocale();
	const labels = useLabels(t);
	const modalities = (values: string[]) => values.map((value) => label(labels.modality, value)).join(", ");
	const tokenPriced = (unit: string | null) => !unit || /token/i.test(unit);
	const released = formatCardDate(card.releaseDate, locale);
	const uptime = formatPercentFloor(card.uptimePct, locale);
	return (
		<HoverCardBody>
			<Header
				icon={<EntityLogo id={card.organisation.id} label={card.organisation.name} />}
				title={card.name}
				meta={[
					<CardLink key="org" href={organisationHref(card.organisation.id)} className={META_LINK_CLASS}>{card.organisation.name}</CardLink>,
					released ? t("released", { date: released }) : null,
					card.status ? label(labels.status, card.status) : null,
				]}
			/>
			<HoverCardStats
				items={[
					{ key: "input", label: t("statInput"), value: tokenPriced(card.inputPriceUnit) ? formatUsd(card.inputPrice) ?? "–" : "–" },
					{ key: "output", label: t("statOutput"), value: tokenPriced(card.outputPriceUnit) ? formatUsd(card.outputPrice) ?? "–" : "–" },
					{ key: "context", label: t("statContext"), value: formatTokensCompact(card.context, locale) ?? "–" },
					{ key: "providers", label: t("statProviders"), value: t("providersValue", { active: card.providers.active, total: card.providers.total }) },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.cheapestProvider && {
						key: "cheapest",
						label: t("rowCheapest"),
						value: <CardLink href={providerHref(card.cheapestProvider.id)}>{card.cheapestProvider.name}</CardLink>,
					},
					(card.inputModalities.length > 0 || card.outputModalities.length > 0) && {
						key: "modalities",
						label: t("rowModalities"),
						value: t("modalitiesValue", { input: modalities(card.inputModalities) || "–", output: modalities(card.outputModalities) || "–" }),
					},
					uptime ? { key: "uptime", label: t("rowUptime"), value: t("uptimeValue", { percent: uptime }) } : null,
					{
						key: "intelligence",
						label: t("rowIntelligence"),
						value: card.intelligence !== null
							? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(card.intelligence)
							: <span className="text-muted-foreground">{t("notScored")}</span>,
					},
				]}
			/>
			{card.features.length + card.tiers.length > 0 ? (
				<HoverCardBadgeRow>
					{card.features.map((feature) => <Badge key={`f-${feature}`} variant="outline" className="rounded-md font-normal">{label(labels.feature, feature)}</Badge>)}
					{card.tiers.map((tier) => <Badge key={`t-${tier}`} variant="outline" className="rounded-md font-normal">{label(labels.tier, tier)}</Badge>)}
				</HoverCardBadgeRow>
			) : null}
		</HoverCardBody>
	);
}

function ProviderView({ card }: { card: ProviderEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const tProviders = useTranslations("Catalogue.providers");
	const locale = useLocale();
	const policies: Record<string, string> = {
		private: tProviders("dataPolicyPrivate"),
		logs: tProviders("dataPolicyLogs"),
		trains: tProviders("dataPolicyTrains"),
	};
	const country = countryName(card.countryCode, locale);
	const newestDate = card.newest ? formatCardDate(card.newest.date, locale) : null;
	return (
		<HoverCardBody>
			<Header
				icon={<EntityLogo id={card.id} label={card.name} />}
				title={card.name}
				meta={[
					country && card.countryCode ? <CardLink key="country" href={countryHref(card.countryCode)} className={META_LINK_CLASS}>{country}</CardLink> : null,
					t("modelCount", { count: card.totalModels }),
					card.dataPolicyTier && policies[card.dataPolicyTier] ? t("dataPolicy", { policy: policies[card.dataPolicyTier] }) : null,
				]}
			/>
			<HoverCardStats
				items={[
					{ key: "live", label: t("statLiveModels"), value: card.activeModels },
					...(card.zeroDataRetention === null ? [] : [{ key: "zdr", label: t("statZdr"), value: card.zeroDataRetention ? tProviders("yes") : tProviders("no") }]),
					{ key: "byok", label: t("statByok"), value: card.byok ? tProviders("yes") : tProviders("no") },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.regions.length > 0 && { key: "regions", label: t("rowRegions"), value: card.regions.join(", ") },
					card.popular.items.length > 0 && { key: "popular", label: t("rowPopular"), value: <RefList list={card.popular} href={modelHref} t={t} /> },
					card.newest && {
						key: "newest",
						label: t("rowNewest"),
						value: (
							<>
								<CardLink href={modelHref(card.newest.id)}>{card.newest.name}</CardLink>
								{card.newest.comingSoon ? <span className="text-muted-foreground"> ({t("comingSoon")})</span> : newestDate ? <span className="text-muted-foreground"> {newestDate}</span> : null}
							</>
						),
					},
				]}
			/>
		</HoverCardBody>
	);
}

function OrganisationView({ card }: { card: OrganisationEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const locale = useLocale();
	const country = countryName(card.countryCode, locale);
	const latestDate = card.latest ? formatCardDate(card.latest.date, locale) : null;
	return (
		<HoverCardBody>
			<Header
				icon={<EntityLogo id={card.id} label={card.name} />}
				title={card.name}
				meta={[
					country && card.countryCode ? <CardLink key="country" href={countryHref(card.countryCode)} className={META_LINK_CLASS}>{country}</CardLink> : null,
					card.since ? t("creatorSince", { year: card.since }) : null,
				]}
			/>
			<HoverCardStats
				items={[
					{ key: "models", label: t("statModels"), value: card.models },
					{ key: "live", label: t("statLive"), value: card.live },
					{ key: "open", label: t("statOpenWeights"), value: card.openWeights },
					{ key: "providers", label: t("statProviders"), value: card.providers },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.latest && {
						key: "latest",
						label: t("rowLatest"),
						value: (
							<>
								<CardLink href={modelHref(card.latest.id)}>{card.latest.name}</CardLink>
								{latestDate ? <span className="text-muted-foreground"> {latestDate}</span> : null}
							</>
						),
					},
					card.mostUsed && { key: "most-used", label: t("rowMostUsed"), value: <CardLink href={modelHref(card.mostUsed.id)}>{card.mostUsed.name}</CardLink> },
					card.servedBy.items.length > 0 && { key: "served-by", label: t("rowServedBy"), value: <RefList list={card.servedBy} href={providerHref} t={t} /> },
				]}
			/>
		</HoverCardBody>
	);
}

function AppView({ card }: { card: AppEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const locale = useLocale();
	const firstSeen = formatCardDate(card.firstSeen, locale);
	return (
		<HoverCardBody>
			<Header
				icon={card.imageUrl
					? <img src={card.imageUrl} alt="" width={LOGO_SIZE} height={LOGO_SIZE} className="size-7 shrink-0 rounded-md border border-border/60 object-cover" />
					: <IconTile><Boxes /></IconTile>}
				title={card.name}
				meta={[card.category ? categoryLabel(t, "appCategory", card.category) || null : null, card.domain]}
			/>
			<HoverCardStats
				items={[
					{ key: "rank", label: t("statRankWeek"), value: card.rank ? t("rankValue", { rank: card.rank }) : "–" },
					{ key: "share", label: t("statTokenShare"), value: formatShare(card.tokenSharePct, locale) ?? "–" },
					{ key: "models", label: t("statModels"), value: card.models ?? "–" },
					{ key: "change", label: t("statRankChange"), value: formatRankChange(card.rankChange, locale) ?? "–" },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.topModels.items.length > 0 && { key: "top", label: t("rowTopModels"), value: <RefList list={card.topModels} href={modelHref} t={t} /> },
					firstSeen ? { key: "first-seen", label: t("rowFirstSeen"), value: firstSeen } : null,
				]}
			/>
		</HoverCardBody>
	);
}

function BenchmarkView({ card }: { card: BenchmarkEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	return (
		<HoverCardBody>
			<Header
				icon={<IconTile><Gauge /></IconTile>}
				title={card.name}
				meta={[card.category ? categoryLabel(t, "benchmarkCategory", card.category) || null : null, t("modelsScored", { count: card.models })]}
			/>
			<HoverCardFacts
				rows={[
					card.leaders.length > 0 && {
						key: "leaders",
						label: t("rowLeaders"),
						value: (
							<ol className="space-y-0.5">
								{card.leaders.map((leader, index) => (
									<li key={leader.id}>
										<span className="text-muted-foreground tabular-nums">{index + 1}. </span>
										<CardLink href={modelHref(leader.id)}>{leader.name}</CardLink>
										{leader.score ? <span className="text-muted-foreground tabular-nums"> {leader.score}</span> : null}
									</li>
								))}
							</ol>
						),
					},
					{ key: "order", label: t("rowScoring"), value: card.lowerIsBetter ? t("lowerIsBetter") : t("higherIsBetter") },
				]}
			/>
		</HoverCardBody>
	);
}

function FamilyView({ card }: { card: FamilyEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const locale = useLocale();
	const first = formatCardDate(card.firstRelease, locale);
	const latest = formatCardDate(card.latestRelease, locale);
	return (
		<HoverCardBody>
			<Header
				icon={card.organisation ? <EntityLogo id={card.organisation.id} label={card.organisation.name} /> : <IconTile><Layers /></IconTile>}
				title={card.name}
				meta={[
					card.organisation ? <CardLink key="org" href={organisationHref(card.organisation.id)} className={META_LINK_CLASS}>{card.organisation.name}</CardLink> : null,
					t("modelFamily"),
				]}
			/>
			<HoverCardStats
				items={[
					{ key: "models", label: t("statModels"), value: card.models },
					{ key: "active", label: t("statLive"), value: card.active },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.members.items.length > 0 && { key: "members", label: t("rowNewest"), value: <RefList list={card.members} href={modelHref} t={t} /> },
					first ? { key: "first", label: t("rowFirstRelease"), value: first } : null,
					latest && latest !== first ? { key: "latest", label: t("rowLatestRelease"), value: latest } : null,
				]}
			/>
		</HoverCardBody>
	);
}

const COLLECTION_KEYS: Record<string, string> = {
	free: "free",
	"image-generation": "imageGeneration",
	"video-generation": "videoGeneration",
	"audio-models": "audioModels",
	tools: "tools",
	reasoning: "reasoning",
	"image-understanding": "imageUnderstanding",
};

function CollectionView({ card }: { card: CollectionEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const key = COLLECTION_KEYS[card.id];
	return (
		<HoverCardBody>
			<Header
				icon={<IconTile><Layers /></IconTile>}
				title={key ? t(`collection.${key}` as never) : card.id}
				meta={[t("modelCollection")]}
			/>
			<HoverCardStats
				items={[
					{ key: "models", label: t("statModels"), value: card.models },
					{ key: "live", label: t("statLive"), value: card.live },
					{ key: "organisations", label: t("statOrganisations"), value: card.organisations },
				]}
			/>
			<HoverCardFacts
				rows={[card.newest.items.length > 0 && { key: "newest", label: t("rowNewest"), value: <RefList list={card.newest} href={modelHref} t={t} /> }]}
			/>
		</HoverCardBody>
	);
}

function CountryView({ card }: { card: CountryEntityCard }) {
	const t = useTranslations("Catalogue.entityCards");
	const locale = useLocale();
	const name = countryName(card.id, locale) ?? card.id;
	const latestDate = card.latest ? formatCardDate(card.latest.date, locale) : null;
	return (
		<HoverCardBody>
			<Header icon={<Flag code={card.id} label={name} />} title={name} meta={[t("organisationCount", { count: card.organisations })]} />
			<HoverCardStats
				items={[
					{ key: "organisations", label: t("statOrganisations"), value: card.organisations },
					{ key: "models", label: t("statModels"), value: card.models },
					{ key: "live", label: t("statLive"), value: card.live },
				]}
			/>
			<HoverCardFacts
				rows={[
					card.topOrganisations.items.length > 0 && { key: "organisations", label: t("rowTopOrganisations"), value: <RefList list={card.topOrganisations} href={organisationHref} t={t} /> },
					card.latest && {
						key: "latest",
						label: t("rowLatest"),
						value: (
							<>
								<CardLink href={modelHref(card.latest.id)}>{card.latest.name}</CardLink>
								{latestDate ? <span className="text-muted-foreground"> {latestDate}</span> : null}
							</>
						),
					},
				]}
			/>
		</HoverCardBody>
	);
}

export function EntityCardView({ card }: { card: EntityCard }) {
	switch (card.kind) {
		case "model":
			return <ModelView card={card} />;
		case "provider":
			return <ProviderView card={card} />;
		case "organisation":
			return <OrganisationView card={card} />;
		case "app":
			return <AppView card={card} />;
		case "benchmark":
			return <BenchmarkView card={card} />;
		case "family":
			return <FamilyView card={card} />;
		case "collection":
			return <CollectionView card={card} />;
		case "country":
			return <CountryView card={card} />;
		default:
			return null;
	}
}

