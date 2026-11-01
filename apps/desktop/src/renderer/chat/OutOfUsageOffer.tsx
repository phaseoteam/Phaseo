import { Gauge } from "lucide-react";
import { resetLabel } from "../../shared/usageLimitRecovery";
import type { ModelSelection } from "../lib/modelPreferences";
import type { Harness } from "../../shared/workspace";
import { ContinueOfferLinks, useContinueOffers } from "./ContinueOffers";
import { ComposerNotice } from "./ComposerBanner";
import { harnessNames } from "./ModelPicker";

/**
 * Above the new-chat composer when the chosen login is out of usage: the same offers a limited chat gets. Choosing one
 * only changes the selection; the chat starts when the person sends.
 */
export function OutOfUsageOffer({ selection, hidden, onChoose }: { selection: ModelSelection; hidden?: readonly Harness[]; onChoose: (selection: ModelSelection) => void }) {
	const { exhausted, resetsAt, offers } = useContinueOffers(selection, true, hidden);
	if (!exhausted) return null;
	return <ComposerNotice variant="warning" role="status" icon={<Gauge />}
		title={`${harnessNames[selection.harness]} is out of usage${resetsAt ? ` until ${resetLabel(new Date(resetsAt).toISOString())}` : ""}`}>
		{offers.length > 0 && <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"><ContinueOfferLinks offers={offers} verb="Use" onChoose={offer => onChoose(offer.selection)} /></p>}
	</ComposerNotice>;
}
