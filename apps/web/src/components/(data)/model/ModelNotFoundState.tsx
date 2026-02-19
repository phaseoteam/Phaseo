import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withUTM } from "@/lib/utm";

interface ModelNotFoundStateProps {
	fullScreen?: boolean;
	modelId?: string;
}

export default function ModelNotFoundState({
	fullScreen = true,
	modelId,
}: ModelNotFoundStateProps) {
	return (
		<main className={fullScreen ? "flex flex-1 flex-col" : "flex flex-col"}>
			<div
				className={
					fullScreen
						? "container mx-auto flex min-h-[60vh] w-full flex-1 items-center justify-center px-4 py-8"
						: "container mx-auto px-4 py-8"
				}
			>
				<div className="w-full max-w-xl rounded-lg border border-dashed bg-muted/30 p-6 text-center md:p-8">
					<p className="text-base font-medium">
						{modelId ? (
							<>
								Model{" "}
								<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
									{modelId}
								</code>{" "}
								is not found
							</>
						) : (
							"Model is not found"
						)}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						We&apos;re continuously adding new models.
					</p>
					<div className="mt-4 flex flex-col items-center gap-3">
						<p className="text-sm text-muted-foreground">Got one to suggest?</p>
						<a
							href={withUTM(
								"https://github.com/AI-Stats/AI-Stats/issues/new",
								{
									campaign: "model-suggestion",
									content: "model-not-found-state",
								}
							)}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<Image
								src="/social/github_light.svg"
								alt="GitHub Logo"
								width={16}
								height={16}
								className="inline dark:hidden"
							/>
							<Image
								src="/social/github_dark.svg"
								alt="GitHub Logo"
								width={16}
								height={16}
								className="hidden dark:inline"
							/>
							Suggest a Model
						</a>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
							or
						</p>
						<Link
							href="/models"
							className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to Models
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}
