import { Logo } from "@/components/Logo";
import type { ModelCandidate } from "@/lib/games/types";
import { cn } from "@/lib/utils";

type GameModelIdentityProps = {
  model: ModelCandidate;
  className?: string;
  logoClassName?: string;
  compact?: boolean;
};

export function GameModelIdentity({
  model,
  className,
  logoClassName,
  compact = false,
}: GameModelIdentityProps) {
  const logoId = model.labSlug ?? model.id.split("/")[0] ?? model.labName;

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Logo
        id={logoId}
        alt={model.labName}
        width={compact ? 16 : 20}
        height={compact ? 16 : 20}
        className={cn(
          "shrink-0 rounded-sm object-contain",
          compact ? "size-4" : "size-5",
          logoClassName
        )}
      />
      <span className="min-w-0 truncate font-medium">{model.name}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {model.labName}
      </span>
    </span>
  );
}
