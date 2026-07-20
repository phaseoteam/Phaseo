import { Fragment } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type KeyboardShortcutProps = {
	keys: readonly string[];
	type?: "sequence" | "chord";
	label: string;
	className?: string;
	title?: string;
};

function KeyboardShortcut({
	keys,
	type = "chord",
	label,
	className,
	title,
}: KeyboardShortcutProps) {
	const SeparatorIcon = type === "sequence" ? ArrowRight : Plus;

	return (
		<KbdGroup
			className={cn("gap-1", className)}
			aria-label={label}
			title={title}
		>
			{keys.map((key, index) => (
				<Fragment key={`${key}-${index}`}>
					{index > 0 ? (
						<span
							aria-hidden="true"
							className="inline-flex text-muted-foreground"
						>
							<SeparatorIcon className="size-3" strokeWidth={1.75} />
						</span>
					) : null}
					<Kbd>{key}</Kbd>
				</Fragment>
			))}
		</KbdGroup>
	);
}

export { KeyboardShortcut };
export type { KeyboardShortcutProps };
