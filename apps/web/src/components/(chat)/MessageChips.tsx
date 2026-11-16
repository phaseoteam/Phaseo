import type { ReactNode } from "react";
import { AppWindow, File, Folder, GitBranch, GitCommitHorizontal, Globe, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { chipCopyText, chipLabel, linkLabel, type Chip } from "@phaseo/app-kit/message-chips";
import { InlineChip } from "@phaseo/ui/inline-chip";
import { GitHubBrandIcon } from "@/components/icons/SocialBrandIcons";
import { useTranslations } from "@/i18n/react";

type Translate = ReturnType<typeof useTranslations<"Common.ui.messageChips">>;
const useChipTranslations = () => useTranslations("Common.ui.messageChips");

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[0.88em]">{children}</span>;
/** What a screen reader hears after the label, such as ", file". */
function Said({ kind }: { kind: Chip["kind"] }) {
	const t = useChipTranslations();
	return <span className="sr-only">{t("kindSuffix", { kind: t(`kinds.${kind}`) })}</span>;
}

type Copied = "pathCopied" | "commitCopied" | "branchCopied";
function copy(t: Translate, text: string, copied: Copied) {
	if (typeof navigator === "undefined" || !navigator.clipboard) {
		toast.error(t("copyFailed"));
		return;
	}
	void navigator.clipboard.writeText(text).then(
		() => toast.success(t(copied)),
		() => toast.error(t("copyFailed")),
	);
}

const openInNewTab = (href: string) => void window.open(href, "_blank", "noopener,noreferrer");

/** A GitHub pull request or issue in a link, for a label the catalogue words. */
export function githubReference(href: string): { kind: "pullRequest" | "issue"; number: number } | undefined {
	const match = /^https:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+\/(pull|issues)\/(\d+)(?:[/?#]|$)/i.exec(href);
	return match ? { kind: match[1]?.toLowerCase() === "pull" ? "pullRequest" : "issue", number: Number(match[2]) } : undefined;
}

function FileChip({ chip }: { chip: Extract<Chip, { kind: "file" | "folder" }> }) {
	const t = useChipTranslations();
	const text = chipCopyText(chip);
	return (
		<InlineChip variant="embedded" icon={chip.kind === "folder" ? <Folder /> : <File />} title={text} onClick={() => copy(t, text, "pathCopied")}>
			{chipLabel(chip)}<Said kind={chip.kind} />
		</InlineChip>
	);
}

function LinkChip({ href }: { href: string }) {
	const t = useChipTranslations();
	const github = /^https:\/\/(?:www\.)?github\.com\//i.test(href);
	const reference = githubReference(href);
	return (
		<InlineChip variant="embedded" href={href} title={href} icon={github ? <GitHubBrandIcon className="shrink-0" /> : <Globe />} onClick={() => openInNewTab(href)}>
			{reference ? t(reference.kind, { number: reference.number }) : linkLabel(href)}<Said kind="link" />
		</InlineChip>
	);
}

function GitChip({ chip }: { chip: Extract<Chip, { kind: "commit" | "branch" }> }) {
	const t = useChipTranslations();
	const text = chipCopyText(chip);
	return (
		<InlineChip variant="embedded" icon={chip.kind === "commit" ? <GitCommitHorizontal /> : <GitBranch />} title={`${text} · ${t("clickToCopy")}`} onClick={() => copy(t, text, chip.kind === "commit" ? "commitCopied" : "branchCopied")}>
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

function ChatChip({ label }: { label: string }) {
	const t = useChipTranslations();
	return <InlineChip variant="embedded" icon={<MessageSquare />} title={label || undefined}>{label || t("chatFallback")}<Said kind="chat" /></InlineChip>;
}

/** One chip in an assistant answer, from `remarkMessageChips`. */
export function MessageChip({ chip }: { chip: Chip }) {
	switch (chip.kind) {
		case "chat": return <ChatChip label={chip.label} />;
		case "link": return <LinkChip href={chip.href} />;
		case "commit": case "branch": return <GitChip chip={chip} />;
		case "local": return <LocalServerChip href={chip.href} />;
		default: return <FileChip chip={chip} />;
	}
}
