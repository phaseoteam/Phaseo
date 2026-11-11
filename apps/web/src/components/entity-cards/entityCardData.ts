// Entity card payloads from `GET /api/_web/entity-cards/<kind>/<id>` (web-api
// `routes/public/entityCards.ts`), cached for the page's lifetime so moving back
// over a link opens its card at once. A 404 is cached as "no card".
import type { EntityKind } from "@/lib/entityCards/matchEntityHref";
import { fetchPublicWebApi, WebApiError } from "@/lib/web-api/client";

export type EntityRef = { id: string; name: string };
export type EntityRefList = { items: EntityRef[]; more: number };

export type ModelEntityCard = {
	kind: "model";
	id: string;
	name: string;
	organisation: EntityRef;
	releaseDate: string | null;
	status: string | null;
	inputPrice: number | null;
	outputPrice: number | null;
	inputPriceUnit: string | null;
	outputPriceUnit: string | null;
	context: number | null;
	providers: { active: number; total: number };
	cheapestProvider: EntityRef | null;
	inputModalities: string[];
	outputModalities: string[];
	uptimePct: number | null;
	intelligence: number | null;
	features: string[];
	tiers: string[];
};

export type ProviderEntityCard = {
	kind: "provider";
	id: string;
	name: string;
	countryCode: string | null;
	totalModels: number;
	activeModels: number;
	dataPolicyTier: string | null;
	zeroDataRetention: boolean;
	byok: boolean;
	regions: string[];
	popular: EntityRefList;
	newest: (EntityRef & { date: string | null; comingSoon: boolean }) | null;
};

export type OrganisationEntityCard = {
	kind: "organisation";
	id: string;
	name: string;
	countryCode: string | null;
	since: string | null;
	models: number;
	live: number;
	openWeights: number;
	providers: number;
	latest: (EntityRef & { date: string | null }) | null;
	mostUsed: EntityRef | null;
	servedBy: EntityRefList;
};

export type AppEntityCard = {
	kind: "app";
	id: string;
	name: string;
	imageUrl: string | null;
	category: string | null;
	domain: string | null;
	rank: number | null;
	tokenSharePct: number | null;
	models: number | null;
	rankChange: number | null;
	topModels: EntityRefList;
	firstSeen: string | null;
};

export type BenchmarkEntityCard = {
	kind: "benchmark";
	id: string;
	name: string;
	category: string | null;
	models: number;
	lowerIsBetter: boolean;
	leaders: Array<EntityRef & { score: string | null }>;
};

export type FamilyEntityCard = {
	kind: "family";
	id: string;
	name: string;
	organisation: EntityRef | null;
	models: number;
	active: number;
	firstRelease: string | null;
	latestRelease: string | null;
	members: EntityRefList;
};

export type CollectionEntityCard = {
	kind: "collection";
	id: string;
	models: number;
	live: number;
	organisations: number;
	newest: EntityRefList;
};

export type CountryEntityCard = {
	kind: "country";
	id: string;
	organisations: number;
	models: number;
	live: number;
	topOrganisations: EntityRefList;
	latest: (EntityRef & { date: string | null }) | null;
};

export type EntityCard =
	| ModelEntityCard
	| ProviderEntityCard
	| OrganisationEntityCard
	| AppEntityCard
	| BenchmarkEntityCard
	| FamilyEntityCard
	| CollectionEntityCard
	| CountryEntityCard;

/** Enough for a long session of hovering; the oldest entries go first. */
const MAX_CACHED_CARDS = 400;
const cache = new Map<string, Promise<EntityCard | null>>();

export function entityCardPath(kind: EntityKind, id: string): `/api/_web/${string}` {
	// Model and family ids keep their slashes as path segments.
	return `/api/_web/entity-cards/${kind}/${id.split("/").map(encodeURIComponent).join("/")}`;
}

/** The card for an entity; null when it has none. Failed loads are not cached. */
export function loadEntityCard(kind: EntityKind, id: string): Promise<EntityCard | null> {
	const key = `${kind}:${id}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const promise = fetchPublicWebApi<{ card?: EntityCard }>(entityCardPath(kind, id))
		.then((body) => (body.card && body.card.kind === kind ? body.card : null))
		.catch((error: unknown) => {
			if (error instanceof WebApiError && error.status === 404) return null;
			cache.delete(key);
			throw error;
		});
	cache.set(key, promise);
	if (cache.size > MAX_CACHED_CARDS) cache.delete(cache.keys().next().value!);
	return promise;
}

/** Test seam: forget every cached card. */
export function clearEntityCardCache() {
	cache.clear();
}
