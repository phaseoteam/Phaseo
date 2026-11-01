import { Gauge } from "lucide-react";
import { resetLabel } from "../../shared/usageLimitRecovery";
import type { ModelSelection } from "../lib/modelPreferences";
import type { Harness } from "../../shared/workspace";
import { ContinueOfferLinks, useContinueOffers } from "./ContinueOffers";
import { harnessNames } from "./ModelPicker";

/**
 * Under the new-chat composer when the chosen login is out of usage: the same offers a limited chat gets. Choosing one
 * only changes the selection; the chat starts when the person sends.
 */
export function OutOfUsageOffer({ selection, hidden, onChoose }: { selection: ModelSelection; hidden?: readonly Harness[]; onChoose: (selection: ModelSelection) => void }) {
	const { exhausted, resetsAt, offers } = useContinueOffers(selection, true, hidden);
	if (!exhausted) return null;
	return <p role="status" className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 text-xs text-muted-foreground">
		<Gauge className="size-3.5 shrink-0 text-warning" />
		<span className="text-foreground/85">{harnessNames[selection.harness]} is out of usage{resetsAt ? ` until ${resetLabel(new Date(resetsAt).toISOString())}` : ""}.</span>
		<ContinueOfferLinks offers={offers} verb="Use" onChoose={offer => onChoose(offer.selection)} />
	</p>;
}
