import { createFileRoute } from "@tanstack/react-router";
import { MarkdownLab } from "@/features/experiments/markdown/MarkdownLab";

export const Route = createFileRoute("/{-$locale}/experiments/markdown/")({
	head: () => ({ meta: [{ title: "Markdown renderer lab" }, { name: "robots", content: "noindex" }] }),
	component: MarkdownLab,
});
