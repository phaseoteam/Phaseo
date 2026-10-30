// Wrap an existing Next.js page module as a TanStack route component.
// Next pages receive `params`/`searchParams` as promises; here they are
// already-fulfilled thenables, so `use(params)` returns synchronously.
import { Outlet, useParams, useSearch } from "@tanstack/react-router";
import { Suspense, useMemo, type ComponentType, type ReactNode } from "react";
import { defaultLocale } from "@/i18n/locales";

type Thenable<T> = Promise<T> & { status: "fulfilled"; value: T };
export type NextParams = Record<string, string | string[] | undefined>;
export type NextSearchParams = Record<string, string | string[] | undefined>;
export type NextPageProps = { params: Promise<NextParams>; searchParams: Promise<NextSearchParams> };

/** A promise React's `use()` reads without suspending. */
export function fulfilled<T>(value: T): Thenable<T> {
	const promise = Promise.resolve(value) as Thenable<T>;
	promise.status = "fulfilled";
	promise.value = value;
	return promise;
}

/** TanStack params → Next params: default locale filled in, `_splat` → string[] under `splatName`. */
export function toNextParams(params: Record<string, unknown>, splatName = "slug"): NextParams {
	const out: NextParams = {};
	for (const [key, value] of Object.entries(params)) {
		if (key === "_splat") out[splatName] = typeof value === "string" ? value.split("/").filter(Boolean).map(decodeURIComponent) : undefined;
		else if (typeof value === "string") out[key] = value;
	}
	out.locale = typeof params.locale === "string" && params.locale ? params.locale : defaultLocale;
	return out;
}

/** Search object (raw strings, see router parseSearch) → Next searchParams. */
export function toNextSearchParams(search: Record<string, unknown>): NextSearchParams {
	const out: NextSearchParams = {};
	for (const [key, value] of Object.entries(search)) {
		if (Array.isArray(value)) out[key] = value.map(String);
		else if (value !== undefined && value !== null) out[key] = String(value);
	}
	return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next pages declare their own params shapes
export function nextPageComponent(Page: ComponentType<any>, options: { splatName?: string } = {}) {
	function RoutePage() {
		const params = useParams({ strict: false }) as Record<string, unknown>;
		const search = useSearch({ strict: false }) as Record<string, unknown>;
		const paramsKey = JSON.stringify(params);
		const searchKey = JSON.stringify(search);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value
		const nextParams = useMemo(() => fulfilled(toNextParams(params, options.splatName)), [paramsKey]);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value
		const nextSearch = useMemo(() => fulfilled(toNextSearchParams(search)), [searchKey]);
		return <Page params={nextParams} searchParams={nextSearch} />;
	}
	RoutePage.displayName = `NextPage(${Page.displayName ?? Page.name ?? "Page"})`;
	return RoutePage;
}

/** Metadata after a JSON round trip: what a server function can return. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SerializableMetadata = { [key: string]: JsonValue };

/** Run a Next `generateMetadata` with the route's params (server side). */
export async function runGenerateMetadata(
	// Pages annotate their props as PageProps or LayoutProps; both receive these.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	generateMetadata: ((props: any, parent: Promise<any>) => unknown) | undefined,
	input: { params: NextParams; search: NextSearchParams },
): Promise<SerializableMetadata | null> {
	if (!generateMetadata) return null;
	const result = await generateMetadata({ params: fulfilled(input.params), searchParams: fulfilled(input.search) }, Promise.resolve({}));
	return toSerializableMetadata(result);
}

export type MetadataInput = { params: Record<string, unknown>; search: Record<string, unknown>; splatName?: string };

export function metadataInput(input: MetadataInput): { params: NextParams; search: NextSearchParams } {
	return { params: toNextParams(input.params, input.splatName), search: toNextSearchParams(input.search) };
}

/** Search parsing that keeps Next semantics: strings, repeated keys → string[]. */
export function parseSearchAsStrings(searchStr: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {};
	for (const [key, value] of new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr)) {
		const existing = out[key];
		if (existing === undefined) out[key] = value;
		else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
	}
	return out;
}

export function stringifySearchFromStrings(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
		else params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

/** Wrap a Next layout: children become the route's <Outlet />. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next layouts declare their own params shapes
export function nextLayoutComponent(Layout: ComponentType<any>, options: { splatName?: string } = {}) {
	function RouteLayout() {
		const params = useParams({ strict: false }) as Record<string, unknown>;
		const paramsKey = JSON.stringify(params);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value
		const nextParams = useMemo(() => fulfilled(toNextParams(params, options.splatName)), [paramsKey]);
		return (
			<Layout params={nextParams}>
				<Outlet />
			</Layout>
		);
	}
	RouteLayout.displayName = `NextLayout(${Layout.displayName ?? Layout.name ?? "Layout"})`;
	return RouteLayout;
}

/** Next `loading.tsx` is a Suspense fallback around the segment's page. */
export function withLoading(Component: ComponentType, Loading: ComponentType) {
	function WithLoading() {
		return (
			<Suspense fallback={<Loading />}>
				<Component />
			</Suspense>
		);
	}
	return WithLoading;
}

/** Metadata holds URL objects (metadataBase, images); send plain JSON across the server-function boundary. */
export function toSerializableMetadata(metadata: unknown): SerializableMetadata | null {
	if (!metadata) return null;
	return JSON.parse(JSON.stringify(metadata)) as SerializableMetadata;
}
