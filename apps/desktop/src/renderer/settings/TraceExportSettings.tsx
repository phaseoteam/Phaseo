import { useEffect, useState } from "react";
import { validateTraceExport } from "../../shared/traceExport";
import { cn } from "../lib/utils";
import { usePreferences } from "./GeneralSettings";
import { SettingsButton, SettingsField, SettingsNote, SettingsSection, settingsInput } from "./SettingsLayout";

const headerText = (headers: Record<string, string>) => Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\n");
function parseHeaders(text: string) {
	const entries = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
		const at = line.indexOf(":");
		if (at < 1) throw new Error(`Write each header as Name: value. "${line.slice(0, 40)}" is not.`);
		return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const;
	});
	return Object.fromEntries(entries);
}

/**
 * Settings → Diagnostics → Export traces: the same spans the trace file keeps (names, timings, outcomes, redacted
 * metadata; never chat text) also go to an OpenTelemetry collector over OTLP/HTTP.
 */
export function TraceExportSettings() {
	const { preferences, save, busy, ready } = usePreferences();
	const current = preferences.threads.traceExport;
	const [endpoint, setEndpoint] = useState(current.endpoint ?? "");
	const [headers, setHeaders] = useState(headerText(current.headers));
	const [error, setError] = useState("");
	useEffect(() => { setEndpoint(current.endpoint ?? ""); setHeaders(headerText(current.headers)); }, [current]);
	const apply = (next: { endpoint: string | null; headers: Record<string, string> }) => {
		try { const traceExport = validateTraceExport(next); setError(""); void save({ ...preferences, threads: { ...preferences.threads, traceExport } }); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	};
	return <SettingsSection title="Export traces" label="Export traces" description="Send the app's trace spans to an OpenTelemetry collector over OTLP/HTTP as they finish. They hold names, timings, outcomes and redacted details, never your chats' text.">
		<form className="flex flex-col gap-3 p-4" onSubmit={event => { event.preventDefault(); try { apply({ endpoint: endpoint.trim() || null, headers: parseHeaders(headers) }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}>
			<SettingsField label="Collector" hint="Its base address (Phaseo adds /v1/traces), https://, or http:// on this computer.">
				<input aria-label="Collector" value={endpoint} spellCheck={false} placeholder="https://otel.example.com" onChange={event => setEndpoint(event.target.value)} className={cn(settingsInput, "font-mono text-xs")} />
			</SettingsField>
			<SettingsField label="Headers" hint="One Name: value a line. Credentials must be references, read when sending: op://vault/item/field (1Password) or env:NAME.">
				<textarea aria-label="Headers" rows={3} value={headers} spellCheck={false} placeholder="Authorization: env:OTEL_TOKEN" onChange={event => setHeaders(event.target.value)} className={cn(settingsInput, "h-auto py-2 font-mono text-xs")} />
			</SettingsField>
			{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
			<div className="flex gap-2">
				<SettingsButton type="submit" variant="primary" disabled={!ready || busy}>Save</SettingsButton>
				{current.endpoint && <SettingsButton variant="ghost" disabled={!ready || busy} onClick={() => apply({ endpoint: null, headers: {} })}>Stop exporting</SettingsButton>}
			</div>
		</form>
	</SettingsSection>;
}
