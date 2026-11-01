import { useEffect, useMemo, useState } from "react";
import { Copy, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { connectPriceText, phoneAddressLabels, type ConnectView, type PhonePairingView, type PhoneState } from "../../shared/phone";
import { formatSpend } from "../../shared/usageAmounts";
import { Switch } from "../components/ui/switch";
import { showToast } from "../components/ui/toast";
import { errorText } from "../app/workspace";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection } from "./SettingsLayout";

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => showToast("success", `${what} copied`), () => showToast("error", `Could not copy the ${what.toLowerCase()}`));
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The QR code as one SVG path, dark on light with the quiet zone scanners need, whatever the theme. */
function QrImage({ qr, label }: { qr: PhonePairingView["qr"]; label: string }) {
	const path = useMemo(() => {
		let d = "";
		for (let index = 0; index < qr.modules.length; index++) if (qr.modules[index] === "1") d += `M${(index % qr.size) + 4} ${Math.floor(index / qr.size) + 4}h1v1h-1z`;
		return d;
	}, [qr]);
	const size = qr.size + 8;
	return <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-52 shrink-0 rounded-md">
		<rect width={size} height={size} fill="#ffffff" /><path d={path} fill="#000000" />
	</svg>;
}

function connectStatus(connect: ConnectView) {
	switch (connect.status) {
		case "connected": return "Connected. Your phones can reach this computer from anywhere.";
		case "connecting": return "Connecting…";
		case "checking": return "Checking…";
		default: return connect.message;
	}
}

/** Settings ▸ Phone: lets the Phaseo phone app use this computer, directly on the same network or through Phaseo Connect. */
export function PhoneSettings() {
	const api = window.phaseoDesktop?.workspace;
	const [state, setState] = useState<PhoneState>();
	const [pairing, setPairing] = useState<PhonePairingView>();
	const [error, setError] = useState<string>();
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!api) return;
		void api.phone().then(setState, reason => setError(errorText(reason)));
		return api.onPhoneChanged(setState);
	}, [api]);
	// A shown code stops working after ten minutes; hide it then rather than leave a dead QR code up.
	useEffect(() => {
		if (!pairing) return;
		const timer = setTimeout(() => setPairing(undefined), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
		return () => clearTimeout(timer);
	}, [pairing]);
	const run = async (work: () => Promise<PhoneState | undefined>) => {
		if (busy) return; setBusy(true);
		try { const next = await work(); if (next) setState(next); setError(undefined); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	if (!api) return null;
	const connect = state?.connect, tailscale = state?.tailscale;
	const pair = () => void run(async () => { setPairing(await api.pairPhone()); return undefined; });
	return <SettingsPageLayout title="Phone" description="Use Phaseo on this computer from the Phaseo phone app: read and answer chats, approve actions and start new ones. On the same Wi-Fi or your Tailscale network it's free; Phaseo Connect works from anywhere.">
		{error && <SettingsNote role="alert" tone="error" className="px-0.5 py-0">{error}</SettingsNote>}
		<SettingsSection title="Phone access">
			<SettingsRow title="Allow phone access" description={!state ? "Checking…" : !state.enabled ? "Off. Nothing listens and Phaseo Connect is disconnected until you turn it on." : state.error ?? (state.running ? `On, on port ${state.port}. Paired phones can connect on the addresses below.` : "Starting…")}
				control={<Switch aria-label="Allow phone access" checked={state?.enabled ?? false} disabled={!state || busy} onCheckedChange={(checked: boolean) => { if (!checked) setPairing(undefined); void run(() => api.updatePhone({ enabled: checked })); }} />} />
		</SettingsSection>
		<SettingsSection title="Addresses" description="Where phones can reach this computer. Phaseo listens only on the ones you turn on, never on every network.">
			{state?.addresses.map(address => <SettingsRow key={address.kind} title={phoneAddressLabels[address.kind]}
				description={<>{address.url && <span className="font-mono">{address.url}</span>}{address.url && address.note && <br />}{address.note}{address.kind === "lan" && " Anyone on this network can try to connect, so use it only on networks you trust."}</>}
				control={<>
					{address.kind === "tailscale-https" && tailscale?.installed && tailscale.dnsName && !tailscale.serving && <SettingsButton disabled={busy || !state.enabled} title={state.enabled ? undefined : "Turn on phone access first"} onClick={() => void run(() => api.setupPhoneHttps())}>Set up HTTPS</SettingsButton>}
					<Switch aria-label={phoneAddressLabels[address.kind]} checked={address.enabled} disabled={busy} onCheckedChange={(checked: boolean) => void run(() => api.updatePhone({ addresses: { [address.kind]: checked } }))} />
				</>} />)}
			{tailscale && !tailscale.installed && <SettingsNote>Tailscale lets your phone reach this computer from anywhere, for free. Install it on both, sign in to the same tailnet, then come back here.</SettingsNote>}
			{tailscale?.installed && tailscale.httpsAvailable === false && !tailscale.serving && <SettingsNote>HTTPS needs certificates turned on for your tailnet in the Tailscale admin console.</SettingsNote>}
		</SettingsSection>
		<SettingsSection title="Phaseo Connect" description="Reach this computer from anywhere without Tailscale. Messages are encrypted on this computer and your phone, so the relay can't read them.">
			<SettingsRow title="Phaseo Connect" description={<>{connectPriceText}.{connect?.account && <><br />Billed to {connect.account}.</>}{connect?.enabled && connect.daysOn !== undefined && connect.estimatedNanos !== undefined && <><br />This month: {connect.daysOn} {connect.daysOn === 1 ? "day" : "days"} on, {formatSpend(connect.estimatedNanos)} so far.</>}</>}
				control={<>
					{connect && connect.status !== "signed-out" && <SettingsButton variant="ghost" title="Check again" disabled={busy} onClick={() => void run(() => api.refreshPhaseoConnect())}><RefreshCw /></SettingsButton>}
					<Switch aria-label="Phaseo Connect" checked={connect?.enabled ?? false} disabled={!connect || busy || connect.status === "signed-out"} onCheckedChange={(checked: boolean) => void run(() => api.setPhaseoConnect(checked))} />
				</>} />
			{connect && connectStatus(connect) && <SettingsNote role="status" tone={connect.status === "error" || connect.status === "paused" ? "error" : "muted"}>{connectStatus(connect)}</SettingsNote>}
		</SettingsSection>
		<SettingsSection title="Paired phones" description="A phone can read and answer chats, approve or decline actions, stop chats and start new ones. It can't change models, permissions or settings."
			action={<SettingsButton variant="primary" disabled={busy || !state?.enabled} title={state?.enabled ? undefined : "Turn on phone access first"} onClick={pair}><QrCode />Pair a phone</SettingsButton>}>
			{pairing && <div className="flex items-start gap-5 px-4 py-4">
				<QrImage qr={pairing.qr} label="Pairing QR code" />
				<div className="flex min-w-0 flex-1 flex-col gap-2.5">
					<p role="status" className="text-[13px] font-semibold">Scan this with the Phaseo phone app.</p>
					<p className="text-xs leading-relaxed text-muted-foreground">Or open this link on the phone. The code works once and stops working at {new Date(pairing.expiresAt).toLocaleTimeString(undefined, { timeStyle: "short" })}. Anyone with it can pair, so don't share it.</p>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{pairing.link}</code>
						<SettingsButton onClick={() => copy(pairing.link, "Link")}><Copy />Copy link</SettingsButton>
					</div>
					<div><SettingsButton variant="ghost" onClick={() => setPairing(undefined)}>Done</SettingsButton></div>
				</div>
			</div>}
			{state?.devices.map(device => <SettingsRow key={device.id} title={device.name}
				description={`${device.connected ? "Connected now" : device.lastSeenAt ? `Last seen ${when(device.lastSeenAt)}` : "Not connected yet"}. Paired ${when(device.pairedAt)}.`}
				control={<SettingsButton variant="danger" disabled={busy} onClick={() => void run(() => api.removePhone(device.id))}><Trash2 />Remove</SettingsButton>} />)}
			{state && !state.devices.length && !pairing && <SettingsNote>No phones yet.</SettingsNote>}
		</SettingsSection>
	</SettingsPageLayout>;
}
