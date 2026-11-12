/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	HoverCardHeader,
	HoverCardLinks,
	HoverCardMeta,
	HoverCardRows,
	HoverCardStat,
	HoverCardStats,
	joinMeta,
} from "./hover-card";

function html(node: ReactNode) {
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(<>{node}</>);
	return container;
}

describe("hover card layout helpers", () => {
	it("joins the meta parts that are set with a middle dot", () => {
		const meta = html(<HoverCardMeta items={["Standard tier", null, "", false, "Ends 12 Mar"]} />);
		expect(meta.textContent).toBe("Standard tier · Ends 12 Mar");
	});

	it("renders no meta line when every part is empty", () => {
		expect(html(<HoverCardMeta items={[null, undefined, ""]} />).innerHTML).toBe("");
	});

	it("puts the title next to its icon and the meta line under it", () => {
		const header = html(<HoverCardHeader icon={<svg data-testid="icon" />} title="Active" meta={["Standard tier"]} />);
		const title = header.querySelector("[data-slot=hover-card-header] > div")!;
		expect(title.querySelector("[data-testid=icon]")).not.toBeNull();
		expect(title.querySelector(".truncate")?.textContent).toBe("Active");
		expect(header.querySelector("[data-slot=hover-card-meta]")?.textContent).toBe("Standard tier");
	});

	it("lays rows out as a description list and skips rows without a value", () => {
		const rows = html(
			<HoverCardRows
				rows={[
					{ label: "Provider", value: "Available" },
					null,
					false,
					{ label: "Range", value: null },
					{ label: "Access", value: "Public" },
				]}
			/>,
		);
		const list = rows.querySelector("dl")!;
		expect(list.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
		expect(Array.from(list.querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Provider", "Access"]);
		expect(Array.from(list.querySelectorAll("dd")).map((dd) => dd.textContent)).toEqual(["Available", "Public"]);
	});

	it("renders nothing when no row has a value", () => {
		expect(html(<HoverCardRows rows={[{ label: "Range", value: undefined }]} />).innerHTML).toBe("");
	});

	it("puts links on one line, skipping missing ones", () => {
		const links = html(
			<HoverCardLinks>
				<a href="/policy">Policy</a>
				{null}
				<a href="/privacy">Privacy</a>
				<a href="/terms">Terms</a>
			</HoverCardLinks>,
		);
		expect(links.textContent).toBe("Policy · Privacy · Terms");
		expect(links.querySelectorAll("a")).toHaveLength(3);
	});

	it("shows the headline number in tabular figures", () => {
		const stat = html(<HoverCardStat>99.5%</HoverCardStat>).querySelector("[data-slot=hover-card-stat]")!;
		expect(stat.className).toContain("text-lg");
		expect(stat.className).toContain("tabular-nums");
	});

	it("lays out up to four stat tiles with the value above a sentence-case label", () => {
		const stats = html(
			<HoverCardStats
				items={[
					{ label: "Input / 1M", value: "$8" },
					null,
					{ label: "Output / 1M", value: "$40" },
					{ label: "Context", value: "1M" },
					{ label: "Providers", value: "1/2" },
					{ label: "Extra", value: "x" },
				]}
			/>,
		).querySelector("[data-slot=hover-card-stats]")!;
		expect(stats.className).toContain("rounded-md");
		expect(stats.className).not.toContain("uppercase");
		expect(Array.from(stats.querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Input / 1M", "Output / 1M", "Context", "Providers"]);
		expect(Array.from(stats.querySelectorAll("dd")).map((dd) => dd.textContent)).toEqual(["$8", "$40", "1M", "1/2"]);
		expect(html(<HoverCardStats items={[null]} />).innerHTML).toBe("");
	});

	it("joins meta parts, or returns null when there are none", () => {
		expect(html(<>{joinMeta(["Acme", null, "", "Released 9 Nov 2026"])}</>).textContent).toBe("Acme · Released 9 Nov 2026");
		expect(joinMeta([null, false, ""])).toBeNull();
	});
});
