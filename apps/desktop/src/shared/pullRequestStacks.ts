import type { PullRequestMergeMethod, TaskPullRequestLink } from "./pullRequestView";

/**
 * Stacked pull requests, after T3 Code. GitHub keeps native stacks (a public preview) that list their layers bottom to
 * top; everything else is chained by matching one pull request's base branch to another's head branch.
 */
export type PullRequestStackState = "open" | "closed" | "merged";
export type PullRequestStackLayer = { number: number; headBranch: string; state: PullRequestStackState; title?: string; draft?: boolean; headSha?: string };
/** A native stack; layers run bottom to top. */
export type PullRequestStack = { id: string; number: number; url: string; base: string; layers: PullRequestStackLayer[] };
/** Where one pull request sits in its native stack, as GitHub's list reports it. */
export type PullRequestStackMembership = { number: number; position: number; size: number; base: string };
/** `defaultBranch` is the repository's default branch, from the checkout, so a pull request on another base reads as stacked. */
export type PullRequestStackRead = { stack: PullRequestStack | null; defaultBranch?: string; readAt: string };
export type PullRequestStackHead = { number: number; headSha: string };
export type PullRequestStackActionRequest = { number: number; stackNumber: number; action: "merge" | "rebase"; method?: PullRequestMergeMethod; expectedHeads: PullRequestStackHead[] };
export type PullRequestChain = { kind: "native" | "derived"; layers: TaskPullRequestLink[] };
export type PullRequestListLine = { link: TaskPullRequestLink; depth: number; chainKey: string; stack: { kind: PullRequestChain["kind"]; size: number } | null };

const sha = /^[a-f0-9]{40}$/i;
const branch = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 255 && ![...value].some(character => character.charCodeAt(0) < 32);
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 2147483647;
const stackState = (state: unknown, mergedAt: unknown): PullRequestStackState => mergedAt ? "merged" : String(state).toLowerCase() === "closed" ? "closed" : String(state).toLowerCase() === "merged" ? "merged" : "open";

/** The first stack of a `GET /repos/{owner}/{repo}/stacks?pull_request=N` listing (T3's decodePullRequestStacksJson); null for none. */
export function parsePullRequestStacks(value: unknown): PullRequestStack | null {
	const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : undefined;
	if (!list) throw new Error("GitHub returned an unreadable stack.");
	const raw = list[0] as Record<string, unknown> | undefined;
	if (!raw) return null;
	const base = typeof raw.base === "string" ? raw.base : raw.base && typeof raw.base === "object" ? (raw.base as Record<string, unknown>).ref : undefined;
	if (!positive(raw.number) || typeof raw.url !== "string" || !branch(base) || !Array.isArray(raw.pull_requests) || raw.pull_requests.length > 100) throw new Error("GitHub returned an unreadable stack.");
	const layers = raw.pull_requests.map(entry => {
		const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}, head = item.head && typeof item.head === "object" ? item.head as Record<string, unknown> : {};
		if (!positive(item.number) || !branch(head.ref)) throw new Error("GitHub returned an unreadable stack.");
		return { number: Number(item.number), headBranch: head.ref, state: stackState(item.state, item.merged_at), ...(typeof item.title === "string" ? { title: item.title.slice(0, 500) } : {}), ...(typeof item.draft === "boolean" ? { draft: item.draft } : {}), ...(typeof head.sha === "string" && sha.test(head.sha) ? { headSha: head.sha.toLowerCase() } : {}) };
	});
	const id = raw.id === null || raw.id === undefined ? (typeof raw.node_id === "string" && raw.node_id.trim() ? raw.node_id.trim() : String(raw.number)) : String(raw.id);
	const html = typeof raw.html_url === "string" && /^https:\/\//.test(raw.html_url) ? raw.html_url : raw.url;
	return { id: id.slice(0, 200), number: Number(raw.number), url: html, base, layers };
}

/** Stored stacks come back through the store; a malformed one is dropped. */
export function validateSavedStack(value: unknown): TaskPullRequestLink["stack"] {
	if (!value || typeof value !== "object") return;
	const stack = value as Record<string, unknown>;
	if (typeof stack.id !== "string" || !positive(stack.number) || typeof stack.url !== "string" || !branch(stack.base) || !Array.isArray(stack.layers) || stack.layers.length > 100) return;
	const layers: NonNullable<TaskPullRequestLink["stack"]>["layers"] = [];
	for (const entry of stack.layers) {
		const layer = entry as Record<string, unknown> | null;
		if (!layer || !positive(layer.number) || !branch(layer.headBranch) || !["open", "closed", "merged"].includes(layer.state as string)) return;
		layers.push({ number: Number(layer.number), headBranch: layer.headBranch, state: layer.state as PullRequestStackState });
	}
	return { id: stack.id, number: Number(stack.number), url: stack.url, base: stack.base, layers };
}

export function validatePullRequestStackAction(value: unknown): PullRequestStackActionRequest {
	const request = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
	if (!positive(request.number) || !positive(request.stackNumber) || (request.action !== "merge" && request.action !== "rebase") || !Array.isArray(request.expectedHeads) || !request.expectedHeads.length || request.expectedHeads.length > 100) throw new Error("Invalid stack action.");
	const expectedHeads = request.expectedHeads.map(entry => {
		const head = entry as Record<string, unknown> | null;
		if (!head || !positive(head.number) || typeof head.headSha !== "string" || !sha.test(head.headSha)) throw new Error("Invalid stack action.");
		return { number: Number(head.number), headSha: head.headSha.toLowerCase() };
	});
	if (new Set(expectedHeads.map(head => head.number)).size !== expectedHeads.length) throw new Error("Invalid stack action.");
	if (request.action === "merge" && !["merge", "squash", "rebase"].includes(request.method as string)) throw new Error("Choose a merge method.");
	return { number: Number(request.number), stackNumber: Number(request.stackNumber), action: request.action, ...(request.action === "merge" ? { method: request.method as PullRequestMergeMethod } : {}), expectedHeads };
}

/**
 * Which layers a stack action touches and whether it may run (T3's runGitHubStackAction and PullRequestStackMenu):
 * merging lands the chosen layer and every unmerged one below it; rebasing moves every unmerged layer, and only
 * from the top. Every touched layer must be open, and for a merge ready for review.
 */
export function stackActionLayers(stack: PullRequestStack, number: number, action: "merge" | "rebase") {
	const index = stack.layers.findIndex(layer => layer.number === number), target = stack.layers[index];
	const unmerged = stack.layers.filter(layer => layer.state !== "merged");
	const layers = action === "merge" ? stack.layers.slice(0, index + 1).filter(layer => layer.state !== "merged") : unmerged;
	const reason = !target ? "This pull request is no longer in the stack."
		: !layers.length ? "Every layer is already merged."
		: layers.some(layer => layer.state !== "open") ? (action === "merge" ? "Every layer being merged must be open and ready for review." : "Every layer must be open to rebase the stack.")
		: action === "merge" && (target.state !== "open" || layers.some(layer => layer.draft)) ? "Every layer being merged must be open and ready for review."
		: layers.some(layer => !layer.headSha) ? "Refresh the stack before acting on it."
		: undefined;
	return { target, layers, reason };
}
/** The expected heads must name exactly the layers the action touches, at the heads GitHub reports now. */
export function stackHeadsMatch(layers: PullRequestStackLayer[], expected: PullRequestStackHead[]) {
	return expected.length === layers.length && layers.every(layer => layer.headSha && expected.some(head => head.number === layer.number && head.headSha === layer.headSha));
}

/** A stack membership read off one native stack, for list rows. */
export function stackMembership(stack: PullRequestStack, number: number): PullRequestStackMembership | undefined {
	const index = stack.layers.findIndex(layer => layer.number === number);
	return index < 0 ? undefined : { number: stack.number, position: index + 1, size: stack.layers.length, base: stack.base };
}

const linkKey = (link: { repository: string; number: number }) => `${link.repository.toLowerCase()}#${link.number}`;
/** Links a person should see: a dismissed stack layer stays only so it is not found again. */
export function visiblePullRequestLinks(links: readonly TaskPullRequestLink[] | undefined): TaskPullRequestLink[] {
	return (links ?? []).filter(link => link.source !== "stack-dismissed");
}
const isOpenLink = (link: TaskPullRequestLink) => !link.snapshot || link.snapshot.state === "open";
const activityAt = (link: TaskPullRequestLink) => { const at = Date.parse(link.snapshot?.updatedAt ?? link.linkedAt); return Number.isNaN(at) ? 0 : at; };

/**
 * Groups a chat's links into stacks (T3's resolveThreadPullRequestChains). Native stacks win; the rest chain by base
 * branch to head branch within one repository. A head name two links share identifies no parent, and a cycle has no
 * top, so those links stay as one-layer chains.
 */
export function pullRequestChains(links: readonly TaskPullRequestLink[]): PullRequestChain[] {
	const visible = visiblePullRequestLinks(links), chains: PullRequestChain[] = [], placed = new Set<string>();
	const native = new Map<string, TaskPullRequestLink[]>();
	for (const link of visible) {
		if (!link.stack) continue;
		const key = `${link.repository.toLowerCase()}#stack:${link.stack.id}`;
		native.set(key, [...native.get(key) ?? [], link]);
	}
	for (const members of native.values()) {
		const order = new Map(members[0].stack!.layers.map((layer, index) => [layer.number, index]));
		members.sort((left, right) => (order.get(left.number) ?? 0) - (order.get(right.number) ?? 0));
		for (const member of members) placed.add(linkKey(member));
		chains.push({ kind: "native", layers: members });
	}
	const remaining = visible.filter(link => !placed.has(linkKey(link)));
	const branchKey = (link: TaskPullRequestLink, name: string) => `${link.repository.toLowerCase()}:${name}`;
	const byHead = new Map<string, TaskPullRequestLink | null>();
	for (const link of remaining) if (link.snapshot) { const key = branchKey(link, link.snapshot.head); byHead.set(key, byHead.has(key) ? null : link); }
	const hasChild = new Set<string>();
	for (const link of remaining) {
		if (!link.snapshot) continue;
		const parent = byHead.get(branchKey(link, link.snapshot.base));
		if (parent && parent !== link) hasChild.add(linkKey(parent));
	}
	for (const top of remaining) {
		if (hasChild.has(linkKey(top))) continue;
		const layers: TaskPullRequestLink[] = [];
		let cursor: TaskPullRequestLink | undefined = top;
		while (cursor && !placed.has(linkKey(cursor))) {
			placed.add(linkKey(cursor)); layers.unshift(cursor);
			cursor = cursor.snapshot ? byHead.get(branchKey(cursor, cursor.snapshot.base)) ?? undefined : undefined;
		}
		if (layers.length) chains.push({ kind: "derived", layers });
	}
	for (const link of remaining) if (!placed.has(linkKey(link))) chains.push({ kind: "derived", layers: [link] });
	return chains;
}

/** Chains as indented lines, newest stack first, each read bottom to top beneath its slot (T3's pullRequestListLines). */
export function pullRequestListLines(chains: readonly PullRequestChain[]): PullRequestListLine[] {
	return [...chains].sort((left, right) => Math.max(...right.layers.map(activityAt)) - Math.max(...left.layers.map(activityAt))).flatMap(chain => {
		const chainKey = linkKey(chain.layers[0]);
		return chain.layers.map((link, depth) => ({ link, depth, chainKey, stack: depth === 0 && chain.layers.length > 1 ? { kind: chain.kind, size: chain.layers.length } : null }));
	});
}

export type PullRequestBadge = { state: "open" | "closed" | "merged" | "draft" } & ({ kind: "stack"; layers: number } | { kind: "pull-request"; others: number });
/** What a chat row's badge shows: one state for every link, and a stack count when they form one chain (T3's resolveThreadPullRequestBadge). */
export function pullRequestBadge(links: readonly TaskPullRequestLink[] | undefined): PullRequestBadge | null {
	const visible = visiblePullRequestLinks(links);
	if (!visible.length) return null;
	const states = visible.map(link => link.snapshot?.state ?? "open");
	const state = visible.every(link => link.snapshot?.state === "open" && link.snapshot.draft) ? "draft" : states.includes("open") ? "open" : states.every(value => value === "merged") ? "merged" : "closed";
	if (visible.length > 1 && pullRequestChains(visible).length === 1) return { kind: "stack", layers: visible.length, state };
	return { kind: "pull-request", others: visible.length - 1, state };
}

/** The one pull request a single-slot surface opens: open work first, the highest open layer of a stack (T3's resolveThreadCurrentPullRequest). */
export function currentPullRequest(links: readonly TaskPullRequestLink[] | undefined): TaskPullRequestLink | undefined {
	const visible = visiblePullRequestLinks(links);
	if (!visible.length) return;
	const open = visible.filter(isOpenLink);
	if (open.length === 1) return open[0];
	const chains = pullRequestChains(visible);
	if (open.length > 1) {
		const openChains = chains.map(chain => [...chain.layers].reverse().filter(isOpenLink)).filter(layers => layers.length)
			.sort((left, right) => Math.max(...right.map(link => Date.parse(link.linkedAt))) - Math.max(...left.map(link => Date.parse(link.linkedAt))));
		return openChains.flat()[0];
	}
	if (chains.length === 1) return chains[0].layers.at(-1);
	return [...visible].sort((left, right) => activityAt(right) - activityAt(left))[0];
}

/** A pull request whose base is not the repository's default branch builds on another (T3's isStackedPullRequestBase). */
export function isStackedBase(base: string, defaultBranch: string | undefined) {
	return Boolean(defaultBranch) && base !== defaultBranch;
}
