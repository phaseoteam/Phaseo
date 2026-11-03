import { useEffect, useMemo } from "react";
import { formatUsdHeadlinePrice } from "@phaseo/app-kit/format";
import type { Harness, ModelOption } from "../../shared/workspace";
import { limitResetAt, otherLogins, outOfUsage, perMillionPrice, phaseoContinuation } from "../../shared/usageLimitRecovery";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import { useModelPreferences, type ModelSelection } from "../lib/modelPreferences";
import { useModels } from "../lib/useModels";
import { checkUsageLocal, usageLocals, useUsageLimits } from "../settings/usageLimitsStore";

export type ContinueOffer = { key: string; label: string; selection: ModelSelection; /** " at $3/$15 per million tokens" for offers that cost money. */ price?: string };
const planHarnesses: Harness[] = ["codex", "claude", "cursor", "grok"];
// A reading older than this is checked again before it decides what to offer.
const STALE_MS = 10 * 60 * 1000;
const asked = new Map<string, number>();
const priceSuffix = (price?: string) => price === "free" ? ", free" : price ? ` at ${price}` : ", price not listed";

/**
 * Where a chat on a plan that is out of usage could go instead: the agent's other signed-in logins with usage left, and
 * Phaseo at the catalogue's price. `exhausted` is whether the given login is out of usage by its last reading, and
 * `resetsAt` (ms) when it allows work again, if known.
 */
export function useContinueOffers(current: ModelSelection | undefined, enabled = true, hidden?: readonly Harness[]) {
	const { api, overview } = useWorkspace();
	const { kept, statuses } = useUsageLimits();
	const preferences = useModelPreferences();
	const plan = enabled && !!current && planHarnesses.includes(current.harness);
	const harness = plan ? current!.harness : undefined;
	const logins = useMemo(() => harness ? usageLocals(overview.accounts).filter(login => login.harness === harness) : [], [harness, overview.accounts]);
	useEffect(() => {
		if (!api) return;
		for (const login of logins) {
			const reading = kept.statuses[login.key];
			const fresh = reading && !("error" in reading) && Date.now() - Date.parse(reading.checkedAt) < STALE_MS;
			// Each check runs the agent's CLI, so a failing login is not asked again on every render.
			if (fresh || statuses[login.key] === "checking" || Date.now() - (asked.get(login.key) ?? 0) < STALE_MS) continue;
			asked.set(login.key, Date.now());
			void checkUsageLocal(api, login);
		}
	}, [api, logins, kept.statuses, statuses]);
	const readings = Object.fromEntries(Object.entries(kept.statuses).flatMap(([key, value]) => "error" in value ? [] : [[key, value]]));
	const own = current ? readings[current.accountId ?? current.harness] : undefined;
	const exhausted = plan && !!own && own.authenticated === true && outOfUsage(own);
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const { models: catalog } = useModels("phaseo", phaseoAccount?.id, undefined, undefined, plan && !!phaseoAccount);
	if (!plan || !current) return { exhausted: false, offers: [] as ContinueOffer[] };
	const resetsAt = exhausted ? limitResetAt(own!) : undefined;
	const offers: ContinueOffer[] = otherLogins(current, logins, readings).map(login => ({
		key: login.key, label: login.title,
		selection: { harness: current.harness, model: current.model, ...login.accountId ? { accountId: login.accountId } : {}, ...current.reasoningEffort ? { reasoningEffort: current.reasoningEffort } : {}, ...current.serviceTier ? { serviceTier: current.serviceTier } : {}, ...current.options ? { options: current.options } : {} },
	}));
	const preferred = [preferences.defaultSelection, ...preferences.recent].find(selection => selection?.harness === "phaseo")?.model;
	const model: ModelOption | undefined = phaseoAccount ? phaseoContinuation(current.model, catalog, preferred) : undefined;
	if (model && phaseoAccount && !hidden?.includes("phaseo")) offers.push({ key: "phaseo", label: `Phaseo ${model.name}`, selection: { harness: "phaseo", accountId: phaseoAccount.id, model: model.id }, price: priceSuffix(perMillionPrice(model.facts, formatUsdHeadlinePrice)) });
	return { exhausted, resetsAt, offers };
}

/** One link per offer, "Continue on Work login" or "Continue on Phaseo Claude Sonnet 4.5 at $3/$15 per million tokens". */
export function ContinueOfferLinks({ offers, verb, busy, onChoose }: { offers: ContinueOffer[]; verb: string; busy?: boolean; onChoose: (offer: ContinueOffer) => void }) {
	return <>{offers.map(offer => <span key={offer.key} className="contents">
		<span aria-hidden>·</span>
		<button type="button" disabled={busy} onClick={() => onChoose(offer)} className="font-medium text-foreground hover:underline disabled:text-muted-foreground disabled:no-underline">
			{verb} {offer.label}{offer.price && <span className="font-normal text-muted-foreground">{offer.price}</span>}
		</button>
	</span>)}</>;
}
