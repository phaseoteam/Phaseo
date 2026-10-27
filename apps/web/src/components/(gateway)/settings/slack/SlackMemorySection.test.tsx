import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../../messages/en-GB/settings-ui.json";
import commonMessages from "../../../../../messages/en-GB/common.json";
import { NotesList, SkillsList, SlackMemorySection } from "./SlackMemorySection";
import { noteScope, skillPatch, slackMemoryError, type SlackAgentMemory, type SlackAgentNote } from "./slackAgentMemory";

jest.mock("@/app/(dashboard)/settings/slack/actions", () => ({
	loadSlackAgentMemory: jest.fn(),
	deleteSlackAgentNote: jest.fn(),
	updateSlackAgentSkill: jest.fn(),
	deleteSlackAgentSkill: jest.fn(),
}));
jest.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

function note(overrides: Partial<SlackAgentNote>): SlackAgentNote {
	return {
		id: "00000000-0000-4000-8000-0000000000e1", kind: "note", channel_id: "C0CHANNEL1", text: "Deploys freeze on Fridays.", done_at: null,
		created_by: "U0PERSON01", created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-20T09:00:00Z", expires_at: null, ...overrides,
	};
}

const MEMORY: SlackAgentMemory = {
	notes: [
		note({ id: "n1", kind: "pin", channel_id: null, text: "Our fiscal year starts on 1 April." }),
		note({ id: "n2" }),
		note({ id: "n3", kind: "todo", channel_id: "D0DIRECT01", text: "Send the Q4 budget.", done_at: "2026-10-21T10:00:00Z", expires_at: "2026-11-01T00:00:00Z" }),
	],
	notes_total: 3,
	notes_used: 37,
	notes_limit: 500,
	skills: [{
		id: "s1", name: "Weekly report", description: "Summarise the week.", instructions: "List what shipped.\nThen what slipped.",
		created_by: "U0PERSON01", created_at: "2026-10-19T09:00:00Z", updated_at: "2026-10-20T09:00:00Z",
	}],
	skills_limit: 100,
};

function render(children: React.ReactNode) {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Common: commonMessages }}>
			{children}
		</NextIntlClientProvider>,
	);
}

describe("SlackMemorySection", () => {
	it("starts closed, saying what memory is, without loading anything", () => {
		const html = render(<SlackMemorySection />);
		expect(html).toContain(">Memory and skills<");
		expect(html).toContain("not copies of Slack messages. Uninstalling deletes them all.");
		expect(html).not.toContain("<h3");
		expect(html).not.toContain("Loading");
	});

	it("lists notes with their kind, where they apply, who saved them and when they're done or kept until", () => {
		const html = render(<NotesList memory={MEMORY} filter="all" loading={false} onFilter={() => undefined} onDeleted={() => undefined} />);
		expect(html).toContain("37 of 500 saved");
		expect(html).toContain("Our fiscal year starts on 1 April.");
		expect(html).toContain(">Whole workspace<");
		expect(html).toContain("Channel C0CHANNEL1");
		expect(html).toContain("Direct message D0DIRECT01");
		expect(html).toContain(">Pin<");
		expect(html).toContain(">To-do<");
		expect(html).toContain("by U0PERSON01");
		expect(html).toContain("Done 21 Oct 2026");
		// Expires at the start of 1 November (UTC): kept through 31 October.
		expect(html).toContain("Kept until 31 Oct 2026");
		expect(html.match(/aria-label="Delete note"/g)).toHaveLength(3);
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
	});

	it("lists skills with their instructions, and says when there is nothing yet", () => {
		const html = render(<SkillsList memory={MEMORY} onChanged={() => undefined} />);
		expect(html).toContain("1 of 100 saved");
		expect(html).toContain(">Weekly report<");
		expect(html).toContain("List what shipped.\nThen what slipped.");
		expect(html).toContain("Saved by U0PERSON01 · updated 20 Oct 2026");
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);

		const empty = { ...MEMORY, notes: [], notes_total: 0, notes_used: 0, skills: [] };
		expect(render(<SkillsList memory={empty} onChanged={() => undefined} />)).toContain("No skills saved yet.");
		expect(render(<NotesList memory={empty} filter="all" loading={false} onFilter={() => undefined} onDeleted={() => undefined} />)).toContain("Nothing saved yet.");
		expect(render(<NotesList memory={empty} filter="pin" loading={false} onFilter={() => undefined} onDeleted={() => undefined} />)).toContain("Nothing of this type saved.");
	});
});

describe("slackAgentMemory", () => {
	it("tells a workspace note from a channel's and a direct message's", () => {
		expect(noteScope(null)).toBe("workspace");
		expect(noteScope("C0CHANNEL1")).toBe("channel");
		expect(noteScope("G0PRIVATE1")).toBe("channel");
		expect(noteScope("D0DIRECT01")).toBe("directMessage");
	});

	it("sends only the skill fields that changed, as web-api stores them", () => {
		const saved = { name: "Weekly report", description: "Summarise the week.", instructions: "List what shipped." };
		expect(skillPatch({ ...saved, name: " Weekly\n summary " }, saved)).toEqual({ ok: true, value: { name: "Weekly summary" } });
		expect(skillPatch({ ...saved, instructions: "  Three bullets.\nNo more.  " }, saved)).toEqual({ ok: true, value: { instructions: "Three bullets.\nNo more." } });
		expect(skillPatch({ ...saved, description: " Summarise  the week. " }, saved)).toEqual({ ok: true, value: {} });
		expect(skillPatch({ ...saved, description: "   " }, saved)).toEqual({ ok: false, problem: { field: "description", code: "required" } });
		expect(skillPatch({ ...saved, name: "x".repeat(61) }, saved)).toEqual({ ok: false, problem: { field: "name", code: "tooLong", max: 60 } });
		// Characters as the database counts them.
		expect(skillPatch({ ...saved, name: "😀".repeat(60) }, saved).ok).toBe(true);
	});

	it("maps the memory routes' own errors, and the rest like the other Slack settings", () => {
		expect(slackMemoryError("memory_not_found", 404)).toEqual({ scope: "memory", key: "memoryNotFound" });
		expect(slackMemoryError("skill_name_taken", 409)).toEqual({ scope: "memory", key: "skillNameTaken" });
		expect(slackMemoryError("not_installed", 404)).toEqual({ scope: "slack", key: "notInstalled", message: undefined });
		expect(slackMemoryError("bad_request", 400, "name can't be empty")).toEqual({ scope: "slack", key: "invalid", message: "name can't be empty" });
		expect(slackMemoryError(null, 503)).toEqual({ scope: "slack", key: "unavailable", message: undefined });
	});
});
