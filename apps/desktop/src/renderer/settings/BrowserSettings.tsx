import { useState } from "react";
import { Plus } from "lucide-react";
import { browserProfileLimits, browserProfiles, browserSearchEngineLabels, browserSearchEngines, customSearchUrlLimit, defaultBrowserProfileId, newBrowserProfileName, validSearchUrlTemplate, type BrowserPreferences, type BrowserProfile, type BrowserSearchEngine } from "../../shared/browserPreferences";
import { errorText } from "../app/workspace";
import { Select } from "../components/Select";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import { isMac } from "../lib/shortcuts";
import { cn } from "../lib/utils";
import { usePreferences } from "./GeneralSettings";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

/** Search words for Settings → Browser. */
export const browserSettingsKeywords = "browser links open links in system browser default browser in-app external ctrl cmd click terminal links search engine address bar url bar duckduckgo google bing brave kagi ecosia custom search url agent browser tools agents web pages automation profiles profile cookies logins sign in site data storage cache clear delete remove rename incognito partition";

/** A profile's data is deleted only after the person confirms what goes. */
type PendingProfileAction = { kind: "remove" | "clear"; profile: BrowserProfile };

/** Settings → Browser: where links open, the address bar's search engine, the agent's browser tools and browser profiles. */
export function BrowserSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	const browser = preferences.browser, disabled = !ready || busy;
	const set = (next: Partial<BrowserPreferences>) => save({ ...preferences, browser: { ...browser, ...next } });
	return <SettingsPageLayout title="Browser" description="Phaseo's built-in browser: the pane beside your chats, and the pages agents open.">
		{(loading || error) && <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"} className="-mt-5 px-0.5">{error || "Loading settings…"}</SettingsNote>}
		<SettingsSection title="Links">
			<SettingsRow title="Open links in" description={`Where links in chats and terminals open, and GitHub pages from pull requests and issues. Without a chat open, they go to the system browser. Hold ${isMac() ? "⌘" : "Ctrl"} while clicking a link, or middle-click it, to open it in the other one.`}
				control={<Select label="Open links in" disabled={disabled} value={browser.openLinksIn} onValueChange={value => { if (value === "phaseo" || value === "system") void set({ openLinksIn: value }); }}
					options={[{ value: "phaseo", label: "Phaseo's browser" }, { value: "system", label: "System browser" }]} />} />
		</SettingsSection>
		<SettingsSection title="Address bar">
			<SearchEngine browser={browser} disabled={disabled} set={set} />
		</SettingsSection>
		<SettingsSection title="Agents" label="Agent browser tools">
			<SettingsRow title="Agent browser tools" description="Let agents open, read and use pages in this browser. When off, agents aren't offered the browser tools at all. Projects can override this in Project settings. Applies from an agent's next turn."
				control={<Switch aria-label="Agent browser tools" disabled={disabled} checked={browser.agentTools} onCheckedChange={value => void set({ agentTools: value })} />} />
		</SettingsSection>
		<Profiles browser={browser} disabled={disabled} set={set} />
	</SettingsPageLayout>;
}

/** The search engine, and the custom search URL when Custom is chosen. Custom is saved once its URL is valid. */
function SearchEngine({ browser, disabled, set }: { browser: BrowserPreferences; disabled: boolean; set: (next: Partial<BrowserPreferences>) => Promise<void> }) {
	const [choosingCustom, setChoosingCustom] = useState(false);
	const [draft, setDraft] = useState<string>();
	const custom = browser.searchEngine === "custom" || choosingCustom;
	const value = draft ?? browser.customSearchUrl;
	const invalid = value.trim() !== "" && !validSearchUrlTemplate(value.trim());
	const commit = () => {
		const url = value.trim();
		if (!url || invalid) return;
		setDraft(undefined);
		if (url !== browser.customSearchUrl || browser.searchEngine !== "custom") void set({ searchEngine: "custom", customSearchUrl: url }).then(() => setChoosingCustom(false));
	};
	return <>
		<SettingsRow title="Search engine" description="What the address bar searches with when what you type isn't an address."
			control={<Select label="Search engine" disabled={disabled} value={custom ? "custom" : browser.searchEngine} onValueChange={next => {
				if (!(browserSearchEngines as readonly string[]).includes(next)) return;
				if (next === "custom") { if (validSearchUrlTemplate(browser.customSearchUrl)) void set({ searchEngine: "custom" }); else setChoosingCustom(true); return; }
				setChoosingCustom(false); setDraft(undefined); void set({ searchEngine: next as BrowserSearchEngine });
			}} options={browserSearchEngines.map(engine => ({ value: engine, label: browserSearchEngineLabels[engine] }))} />} />
		{custom && <SettingsRow title="Custom search URL" description={invalid ? <span className="text-destructive">Enter an http or https URL with %s where the search terms go.</span> : browser.searchEngine === "custom" ? "%s is replaced with what you searched for." : "Enter a URL with %s where the search terms go. Searches use the current engine until then."}
			control={<input aria-label="Custom search URL" aria-invalid={invalid} disabled={disabled} maxLength={customSearchUrlLimit} placeholder="https://example.com/search?q=%s" value={value} spellCheck={false}
				className={cn(settingsInput, "w-72 font-mono text-xs", invalid && "border-destructive")} onChange={event => setDraft(event.target.value)} onBlur={commit}
				onKeyDown={event => { if (event.key === "Enter") commit(); if (event.key === "Escape") { setDraft(undefined); if (browser.searchEngine !== "custom") setChoosingCustom(false); } }} />} />}
	</>;
}

/** Browser profiles: the default for new tabs, and the person's own profiles to add, rename, clear and remove. */
function Profiles({ browser, disabled, set }: { browser: BrowserPreferences; disabled: boolean; set: (next: Partial<BrowserPreferences>) => Promise<void> }) {
	const [pending, setPending] = useState<PendingProfileAction>();
	const [working, setWorking] = useState(false), [actionError, setActionError] = useState(""), [notice, setNotice] = useState("");
	const profiles = browserProfiles(browser), full = browser.profiles.length >= browserProfileLimits.count;
	const add = () => { if (full) return; setNotice(""); void set({ profiles: [...browser.profiles, { id: `profile-${crypto.randomUUID()}`, name: newBrowserProfileName(browser) }] }); };
	const rename = (id: string, name: string) => { const trimmed = name.trim().slice(0, browserProfileLimits.name); if (trimmed && browser.profiles.some(profile => profile.id === id && profile.name !== trimmed)) void set({ profiles: browser.profiles.map(profile => profile.id === id ? { ...profile, name: trimmed } : profile) }); };
	// The data goes first: a profile is only taken off the list once its cookies and logins are gone.
	const confirm = async () => {
		if (!pending) return;
		const api = window.phaseoDesktop;
		if (!api) { setActionError("Open the desktop app to change browser profiles."); return; }
		setWorking(true); setActionError("");
		try {
			await api.browserProfileClear(pending.profile.id);
			if (pending.kind === "remove") await set({ profiles: browser.profiles.filter(profile => profile.id !== pending.profile.id), ...(browser.defaultProfile === pending.profile.id ? { defaultProfile: defaultBrowserProfileId } : {}) });
			setNotice(pending.kind === "remove" ? `Removed ${pending.profile.name} and its browsing data.` : `Cleared ${pending.profile.name}'s browsing data.`);
			setPending(undefined);
		} catch (reason) { setActionError(errorText(reason)); } finally { setWorking(false); }
	};
	return <SettingsSection title="Profiles" label="Browser profiles" description="Each profile keeps its own cookies, site data and logins. Change a tab's profile from its menu."
		action={<SettingsButton disabled={disabled || full} title={full ? `You can have up to ${browserProfileLimits.count} profiles.` : undefined} onClick={add}><Plus />Add profile</SettingsButton>}>
		<SettingsRow title="Default profile" description="New tabs open in this profile. Links a page opens in a new tab stay in that page's profile."
			control={<Select label="Default browser profile" disabled={disabled || profiles.length < 2} value={browser.defaultProfile} onValueChange={value => { if (profiles.some(profile => profile.id === value)) void set({ defaultProfile: value }); }}
				options={profiles.map(profile => ({ value: profile.id, label: profile.name }))} />} />
		{profiles.map(profile => {
			const builtIn = profile.id === defaultBrowserProfileId, isDefault = profile.id === browser.defaultProfile;
			return <SettingsRow key={profile.id} title={builtIn ? profile.name : <input key={`${profile.id}:${profile.name}`} aria-label={`Rename ${profile.name}`} defaultValue={profile.name} maxLength={browserProfileLimits.name} disabled={disabled} className={cn(settingsInput, "w-56")}
					onBlur={event => { if (event.target.value.trim()) rename(profile.id, event.target.value); else event.target.value = profile.name; }}
					onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = profile.name; event.currentTarget.blur(); } }} />}
				description={[builtIn ? "Built in, so it can't be removed." : "", isDefault ? "New tabs open here." : ""].filter(Boolean).join(" ") || undefined}
				control={<>
					<SettingsButton variant="ghost" disabled={disabled || working} onClick={() => { setActionError(""); setNotice(""); setPending({ kind: "clear", profile }); }}>Clear data</SettingsButton>
					{!builtIn && <SettingsButton variant="danger" disabled={disabled || working} onClick={() => { setActionError(""); setNotice(""); setPending({ kind: "remove", profile }); }}>Remove</SettingsButton>}
				</>} />;
		})}
		{notice && <SettingsNote role="status">{notice}</SettingsNote>}
		<Dialog open={pending !== undefined} onOpenChange={open => { if (!open && !working) { setPending(undefined); setActionError(""); } }}>
			<DialogContent className="max-w-md gap-4 p-5">
				<DialogHeader>
					<DialogTitle>{pending?.kind === "remove" ? `Remove “${pending.profile.name}”?` : `Clear “${pending?.profile.name ?? ""}” browsing data?`}</DialogTitle>
					<DialogDescription className="text-xs">{pending?.kind === "remove"
						? "Its cookies, logins, site data and cache are deleted from this computer, and you are signed out of every site in it. Tabs open in it stay open, signed out, and use the Default profile once reopened. This can't be undone."
						: "Its cookies, logins, site data and cache are deleted from this computer, and you are signed out of every site in it. The profile stays. This can't be undone."}</DialogDescription>
				</DialogHeader>
				{actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}
				<DialogFooter>
					<Button size="sm" variant="outline" disabled={working} onClick={() => setPending(undefined)}>Cancel</Button>
					<Button size="sm" variant="destructive" disabled={working} onClick={() => void confirm()}>{working ? (pending?.kind === "remove" ? "Removing…" : "Clearing…") : pending?.kind === "remove" ? "Remove profile and data" : "Clear data"}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</SettingsSection>;
}
