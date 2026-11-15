import type { ReactNode } from "react";
import { AppWindow, File, Folder, GitBranch, GitCommitHorizontal, Globe, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { CHIP_KIND_NAMES, chipCopyText, chipLabel, linkLabel, type Chip } from "@phaseo/app-kit/message-chips";
import { InlineChip } from "@phaseo/ui/inline-chip";
import { GitHubBrandIcon } from "@/components/icons/SocialBrandIcons";

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[0.88em]">{children}</span>;
/** What a screen reader hears after the label, such as ", file". */
const Said = ({ kind }: { kind: Chip["kind"] }) => <span className="sr-only">{`, ${CHIP_KIND_NAMES[kind]}`}</span>;

function copy(text: string, what: string) {
	if (typeof navigator === "undefined" || !navigator.clipboard) {
		toast.error(`Could not copy the ${what.toLowerCase()}`);
		return;
	}
	void navigator.clipboard.writeText(text).then(
		() => toast.success(`${what} copied`),
		() => toast.error(`Could not copy the ${what.toLowerCase()}`),
	);
}

const openInNewTab = (href: string) => void window.open(href, "_blank", "noopener,noreferrer");

function FileChip({ chip }: { chip: Extract<Chip, { kind: "file" | "folder" }> }) {
	const text = chipCopyText(chip);
	return (
		<InlineChip variant="embedded" icon={chip.kind === "folder" ? <Folder /> : <File />} title={text} onClick={() => copy(text, "Path")}>
			{chipLabel(chip)}<Said kind={chip.kind} />
		</InlineChip>
	);
}

function LinkChip({ href }: { href: string }) {
	const github = /^https:\/\/(?:www\.)?github\.com\//i.test(href);
	return (
		<InlineChip variant="embedded" href={href} title={href} icon={github ? <GitHubBrandIcon className="shrink-0" /> : <Globe />} onClick={() => openInNewTab(href)}>
			{linkLabel(href)}<Said kind="link" />
		</InlineChip>
	);
}

function GitChip({ chip }: { chip: Extract<Chip, { kind: "commit" | "branch" }> }) {
	const text = chipCopyText(chip);
	return (
		<InlineChip variant="embedded" icon={chip.kind === "commit" ? <GitCommitHorizontal /> : <GitBranch />} title={`${text} · click to copy`} onClick={() => copy(text, chip.kind === "commit" ? "Commit" : "Branch")}>
			{chip.kind === "commit" ? <Mono>{chipLabel(chip)}</Mono> : chip.name}<Said kind={chip.kind} />
		</InlineChip>
	);
}

/** A local server; the web can't probe localhost, so it has no running state. */
function LocalServerChip({ href }: { href: string }) {
	return (
		<InlineChip variant="embedded" href={href} title={href} icon={<AppWindow />} onClick={() => openInNewTab(href)}>
			{chipLabel({ kind: "local", href })}<Said kind="local" />
		</InlineChip>
	);
}

/** One chip in an assistant answer, from `remarkMessageChips`. */
export function MessageChip({ chip }: { chip: Chip }) {
	switch (chip.kind) {
		case "chat":
			return <InlineChip variant="embedded" icon={<MessageSquare />} title={chip.label}>{chipLabel(chip)}<Said kind="chat" /></InlineChip>;
		case "link": return <LinkChip href={chip.href} />;
		case "commit": case "branch": return <GitChip chip={chip} />;
		case "local": return <LocalServerChip href={chip.href} />;
		default: return <FileChip chip={chip} />;
	}
}
