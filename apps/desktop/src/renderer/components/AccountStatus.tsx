import type { AccountStatus as NativeAccountStatus, UsageWindow } from "../../shared/workspace";

function Usage({ label, window }: { label: string; window: UsageWindow | null }) {
	if (!window) return <p>{label}: unavailable</p>;
	const remaining = Math.round((100 - window.usedPercent) * 10) / 10;
	const minutes = window.windowDurationMins;
	const duration = minutes === null ? label : minutes % 1440 === 0 ? `${minutes / 1440} day` : minutes % 60 === 0 ? `${minutes / 60} hour` : `${minutes} minute`;
	return <div><label>{duration}: {remaining}% remaining <progress aria-label={`${duration} usage remaining`} value={remaining} max={100} /></label>{window.resetsAt !== null && <small>Resets {new Date(window.resetsAt * 1000).toLocaleString()}</small>}</div>;
}

export function AccountStatus({ status }: { status: NativeAccountStatus }) {
	return <div className="account-status"><p>{status.authenticated === true ? "Signed in" : status.authenticated === false ? "Sign-in required" : "Authentication status unavailable"}{status.method ? ` · ${status.method}` : ""}{status.plan ? ` · ${status.plan}` : ""}{status.identity ? ` · ${status.identity}` : ""}</p>
		{status.ordinaryUsageAllowed === false && <p className="task-error">Included usage is blocked.</p>}
		{status.usage?.map(bucket => <div key={bucket.id}><strong>{bucket.name}</strong>{bucket.spendControlReached === true && <p className="task-error">Spend limit reached.</p>}<Usage label="Primary window" window={bucket.primary} /><Usage label="Secondary window" window={bucket.secondary} /></div>)}
		{status.usageError && <p className="task-muted">{status.usageError}</p>}
		<small>Checked {new Date(status.checkedAt).toLocaleTimeString()}</small>
	</div>;
}
