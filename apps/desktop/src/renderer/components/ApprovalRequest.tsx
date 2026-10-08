import { useRef, useState } from "react";
export function ApprovalRequest({ description, onDecision }: { description: string; onDecision: (decision: "accept" | "decline") => Promise<boolean> }) {
	const inFlight = useRef(false);
	const [pending, setPending] = useState<"accept" | "decline">();
	const [error, setError] = useState("");
	async function decide(decision: "accept" | "decline") {
		if (inFlight.current) return;
		inFlight.current = true; setPending(decision); setError("");
		try { if (!await onDecision(decision)) setError("The decision could not be sent. Try again."); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "The decision could not be sent."); }
		finally { inFlight.current = false; setPending(undefined); }
	}
	return <section className="task-approval" aria-label="Approval needed" aria-busy={Boolean(pending)}><strong>Approval needed</strong><pre>{description}</pre>{error && <p role="alert">{error}</p>}<div className="request-actions"><button type="button" disabled={Boolean(pending)} onClick={() => void decide("decline")}>{pending === "decline" ? "Denying…" : "Deny"}</button><button type="button" className="task-primary" disabled={Boolean(pending)} onClick={() => void decide("accept")}>{pending === "accept" ? "Allowing…" : "Allow"}</button></div></section>;
}
