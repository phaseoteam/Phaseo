import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import settingsMessages from "../../../../../messages/en-GB/settings-ui.json";
import commonMessages from "../../../../../messages/en-GB/common.json";
import { PagesList, SharingFields, SlackPagesSection } from "./SlackPagesSection";
import type { SlackAgentSettings } from "./slackAgentForm";
import { linkAccessPatch, pageSettings, pageSharing, slackPagesError, type SlackAgentPages } from "./slackAgentPages";

vi.mock("@/features/settings/slack/actions", () => ({
	updateSlackAgent: vi.fn(),
	loadSlackAgentPages: vi.fn(),
	deleteSlackAgentPage: vi.fn(),
}));
vi.mock("../PrivateSettingsQuery", () => ({
	useSettingsWrite: () => (operation: Promise<unknown>) => operation,
}));

const PAGES: SlackAgentPages = {
	available: true,
	sign_in: true,
	limit: 200,
	pages: [
		{
			id: "Q2hhcnRzQW5kVGFibGVzMQ", url: `https://slack.phaseo.app/p/${"a".repeat(64)}/Q2hhcnRzQW5kVGFibGVzMQ`, title: "October spend", access: "workspace",
			created_by: "U0PERSON01", created_at: "2026-10-20T09:00:00Z", expires_at: "2026-11-19T09:00:00Z", views: 1234,
		},
		{
			id: "U3BlbmRCeU1vZGVsMDAwMQ", url: `https://slack.phaseo.app/p/${"a".repeat(64)}/U3BlbmRCeU1vZGVsMDAwMQ`, title: "Spend by model", access: "link",
			created_by: "U0PERSON02", created_at: "2026-10-21T09:00:00Z", expires_at: "2026-10-28T09:00:00Z", views: 0,
		},
	],
};

const SETTINGS = pageSettings({ pages_enabled: true, page_expiry_days: 30, page_default_access: "link", page_link_access: true });

function render(children: React.ReactNode) {
	return renderToStaticMarkup(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Common: commonMessages }}>
			{children}
		</AppIntlProvider>,
	);
}

describe("SlackPagesSection", () => {
	it("starts closed with its switch, saying what pages are and how long they're kept, without loading anything", () => {
		const html = render(<SlackPagesSection settings={{ pages_enabled: true } as SlackAgentSettings} />);
		expect(html).toContain(">Shared pages<");
		expect(html).toContain("so it&#x27;s kept only until it expires. Uninstalling deletes them all.");
		expect(html).toContain("Let the agent publish pages");
		expect(html).toContain("People from other companies (Slack Connect) can&#x27;t publish pages.");
		expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
		expect(html).not.toContain("<h3");
		expect(html).not.toContain("Loading");
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
		// Off, and an API from before shared pages (on by default).
		expect(render(<SlackPagesSection settings={{ pages_enabled: false } as SlackAgentSettings} />)).toMatch(/role="switch"[^>]*aria-checked="false"/);
		expect(render(<SlackPagesSection settings={{} as SlackAgentSettings} />)).toMatch(/role="switch"[^>]*aria-checked="true"/);
	});

	it("lists pages with who can view them, who asked, when they expire and their views, linked to open in a new tab", () => {
		const html = render(<PagesList pages={PAGES} onDeleted={() => undefined} />);
		expect(html).toContain("2 of 200 kept");
		expect(html).toMatch(/href="https:\/\/slack\.phaseo\.app\/p\/a{64}\/Q2hhcnRzQW5kVGFibGVzMQ" target="_blank" rel="noopener noreferrer"/);
		expect(html).toContain(">October spend<");
		expect(html).toContain(">People in this Slack workspace<");
		expect(html).toContain(">Anyone with the link<");
		expect(html).toContain("by U0PERSON01");
		expect(html).toContain("20 Oct 2026");
		expect(html).toContain("19 Nov 2026");
		expect(html).toContain(">1,234<");
		expect(html.match(/aria-label="Delete page"/g)).toHaveLength(2);
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
		expect(render(<PagesList pages={{ ...PAGES, pages: [] }} onDeleted={() => undefined} />)).toContain("No pages yet.");
	});

	it("offers the expiry, link sharing and the default, and says when Sign in with Slack isn't set up", () => {
		const html = render(<SharingFields settings={SETTINGS} signIn onChange={() => undefined} />);
		for (const days of ["7 days", "30 days", "90 days"]) expect(html).toContain(`>${days}<`);
		expect(html).toContain("Anyone with the link can view pages");
		expect(html).toContain("New pages are open to");
		expect(html).not.toContain("isn&#x27;t set up");

		const noSignIn = render(<SharingFields settings={SETTINGS} signIn={false} onChange={() => undefined} />);
		expect(noSignIn).not.toContain("New pages are open to");
		expect(noSignIn).toContain("Sign in with Slack isn&#x27;t set up for this Slack app, so pages are open to anyone with the link.");

		const noWay = render(<SharingFields settings={{ ...SETTINGS, linkAccess: false, defaultAccess: "workspace" }} signIn={false} onChange={() => undefined} />);
		expect(noWay).toContain("the agent can&#x27;t publish pages.");
	});
});

describe("slackAgentPages", () => {
	it("reads the page settings, with the database's defaults", () => {
		expect(pageSettings({})).toEqual({ enabled: true, expiryDays: 30, defaultAccess: "link", linkAccess: true });
		expect(pageSettings({ pages_enabled: false, page_expiry_days: 90, page_default_access: "workspace", page_link_access: false })).toEqual({ enabled: false, expiryDays: 90, defaultAccess: "workspace", linkAccess: false });
		expect(pageSettings({ page_expiry_days: 14 }).expiryDays).toBe(30);
	});

	it("decides who new pages can be shared with as the agent does", () => {
		expect(pageSharing(SETTINGS, true)).toEqual({ modes: ["link", "workspace"], effectiveDefault: "link" });
		expect(pageSharing({ ...SETTINGS, defaultAccess: "workspace" }, false)).toEqual({ modes: ["link"], effectiveDefault: "link" });
		expect(pageSharing({ ...SETTINGS, linkAccess: false, defaultAccess: "workspace" }, true)).toEqual({ modes: ["workspace"], effectiveDefault: "workspace" });
		expect(pageSharing({ ...SETTINGS, linkAccess: false }, false)).toEqual({ modes: [], effectiveDefault: null });
	});

	it("moves a link default to the workspace when link sharing goes off, as web-api does", () => {
		expect(linkAccessPatch(false, SETTINGS)).toEqual({ page_link_access: false, page_default_access: "workspace" });
		expect(linkAccessPatch(false, { ...SETTINGS, defaultAccess: "workspace" })).toEqual({ page_link_access: false });
		expect(linkAccessPatch(true, { ...SETTINGS, linkAccess: false, defaultAccess: "workspace" })).toEqual({ page_link_access: true });
	});

	it("maps the pages routes' own error, and the rest like the other Slack settings", () => {
		expect(slackPagesError("page_not_found", 404)).toEqual({ scope: "pages", key: "pageNotFound" });
		expect(slackPagesError("not_installed", 404)).toEqual({ scope: "slack", key: "notInstalled", message: undefined });
		expect(slackPagesError(null, 503)).toEqual({ scope: "slack", key: "unavailable", message: undefined });
	});
});
